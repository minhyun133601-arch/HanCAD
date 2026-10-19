import { decodeDxfFields } from '@hancad/db';
import type { DatabaseObject, JsonObject, JsonValue } from '@hancad/db';
import { geometryFromFields, magnitude3, subtract3 } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { curveObjectPoint } from './entity-curve-properties';

export interface NativeGeometryEdit {
  handle: string;
  fields: JsonObject;
  cacheFields?: JsonObject;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const tuple = (point: Vec3): number[] => [point.x, point.y, point.z];
export function nativeEditedFields(original: JsonObject, patch: JsonObject): JsonObject {
  const fields = { ...original };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete fields[key];
    else fields[key] = value;
  }
  return fields;
}
function vertexChildren(
  object: DatabaseObject,
  objects: readonly DatabaseObject[],
): DatabaseObject[] {
  return objects.filter((child) => child.owner === object.handle && child.type === 'VERTEX');
}

/** Merge mapped raw fallback and materialize owned old-style POLYLINE vertices. */
export function nativeGeometryFields(
  object: DatabaseObject,
  objects: readonly DatabaseObject[],
): JsonObject {
  const fields = { ...decodeDxfFields(object.type, object.groups), ...object.fields };
  if (object.type === 'POLYLINE') {
    const children = vertexChildren(object, objects);
    if (children.length)
      fields.vertices = children.map((child) => ({
        ...decodeDxfFields(child.type, child.groups),
        ...child.fields,
      }));
  }
  return fields;
}
function polylineEdits(
  object: DatabaseObject,
  objects: readonly DatabaseObject[],
  original: JsonObject,
  old: Extract<CurveGeometry, { type: 'POLYLINE' | 'LWPOLYLINE' }>,
  next: Extract<CurveGeometry, { type: 'POLYLINE' | 'LWPOLYLINE' }>,
): NativeGeometryEdit[] {
  if (old.vertices.length !== next.vertices.length)
    throw new Error('Properties does not change the vertex count.');
  const fields: JsonObject = {},
    children = vertexChildren(object, objects),
    edits: NativeGeometryEdit[] = [];
  if (old.closed !== next.closed)
    fields.flags = (Number(original.flags ?? 0) & ~1) | (next.closed ? 1 : 0);
  const elevation = next.is3D ? 0 : curveObjectPoint(next.vertices[0]!.position, next.normal).z;
  const previousElevation = old.is3D
    ? 0
    : curveObjectPoint(old.vertices[0]!.position, old.normal).z;
  if (Math.abs(elevation - previousElevation) > 1e-10) {
    if (object.type === 'LWPOLYLINE') fields.elevation = elevation;
    else {
      const position = Array.isArray(original.position) ? original.position : [0, 0, 0];
      fields.position = [position[0] ?? 0, position[1] ?? 0, elevation];
    }
  }
  const globalChanged = old.constantWidth !== next.constantWidth;
  const uniformGlobal =
    globalChanged &&
    next.vertices.every(
      (vertex) =>
        vertex.startWidth === next.constantWidth && vertex.endWidth === next.constantWidth,
    );
  if (globalChanged) {
    if (object.type === 'LWPOLYLINE') fields.constantWidth = next.constantWidth;
    else if (uniformGlobal) {
      fields.startWidth = next.constantWidth;
      fields.endWidth = next.constantWidth;
    }
  }
  const raw = Array.isArray(original.vertices) ? original.vertices : [];
  const vertices: JsonObject[] = next.vertices.map((vertex, index) => {
    const item = raw[index];
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Polyline vertex record is missing.');
    const result = structuredClone(item),
      before = old.vertices[index]!;
    const point = next.is3D ? vertex.position : curveObjectPoint(vertex.position, next.normal);
    const previous = old.is3D ? before.position : curveObjectPoint(before.position, old.normal);
    if (
      !same(tuple(point).slice(0, next.is3D ? 3 : 2), tuple(previous).slice(0, old.is3D ? 3 : 2))
    ) {
      const oldPosition = Array.isArray(result.position) ? result.position : [0, 0, 0];
      result.position = next.is3D
        ? tuple(point)
        : object.type === 'LWPOLYLINE'
          ? [point.x, point.y]
          : [point.x, point.y, oldPosition[2] ?? 0];
    }
    if (before.bulge !== vertex.bulge) result.bulge = vertex.bulge;
    for (const key of ['startWidth', 'endWidth'] as const) {
      if (uniformGlobal) delete result[key];
      else if (vertex[key] !== before[key] || (globalChanged && object.type === 'LWPOLYLINE'))
        result[key] = vertex[key];
    }
    if (object.type === 'POLYLINE' && children[index] && !same(item, result)) {
      const patch: JsonObject = {};
      for (const key of ['position', 'bulge', 'startWidth', 'endWidth'])
        if (!same(item[key], result[key])) patch[key] = result[key] ?? null;
      edits.push({ handle: children[index]!.handle, fields: patch });
    }
    return result;
  });
  const changedVertices = !same(raw, vertices);
  const cacheFields: JsonObject = {};
  if (changedVertices) {
    if (object.type === 'LWPOLYLINE') fields.vertices = vertices;
    else if (!children.length || object.fields.vertices !== undefined)
      cacheFields.vertices = vertices;
  }
  const validation = geometryFromFields(object.type, { ...original, ...fields, vertices });
  if (validation.status !== 'ok') throw new Error('The edited polyline is invalid.');
  return [
    { handle: object.handle, fields, ...(Object.keys(cacheFields).length ? { cacheFields } : {}) },
    ...edits,
  ];
}

/** Build only changed DXF fields; owners, raw unknown groups and ancillary graphs stay intact. */
export function nativeGeometryEdits(
  object: DatabaseObject,
  objects: readonly DatabaseObject[],
  before: CadEntity,
  after: CadEntity,
): NativeGeometryEdit[] {
  const old = before.curve,
    next = after.curve;
  if (!old || !next || same(old, next)) return [];
  if (old.type !== next.type) throw new Error('Properties cannot change the native geometry type.');
  const original = nativeGeometryFields(object, objects),
    fields: JsonObject = {};
  if (
    (old.type === 'POLYLINE' || old.type === 'LWPOLYLINE') &&
    (next.type === 'POLYLINE' || next.type === 'LWPOLYLINE')
  )
    return polylineEdits(object, objects, original, old, next);
  const put = (name: string, previous: unknown, changed: JsonValue): void => {
    if (!same(previous, changed)) fields[name] = changed;
  };
  if (old.type === 'POINT' && next.type === 'POINT')
    put('position', tuple(old.position), tuple(next.position));
  else if (old.type === 'LINE' && next.type === 'LINE') {
    if (magnitude3(subtract3(next.end, next.start)) < 1e-12)
      throw new Error('Line length must be positive.');
    put('start', tuple(old.start), tuple(next.start));
    put('end', tuple(old.end), tuple(next.end));
  } else if (
    (old.type === 'CIRCLE' || old.type === 'ARC') &&
    (next.type === 'CIRCLE' || next.type === 'ARC')
  ) {
    if (!same(old.center, next.center))
      fields.center = tuple(curveObjectPoint(next.center, old.normal));
    put('radius', old.radius, next.radius);
    if (old.type === 'ARC' && next.type === 'ARC') {
      put('startAngle', (old.startAngle * 180) / Math.PI, (next.startAngle * 180) / Math.PI);
      put(
        'endAngle',
        ((old.startAngle + old.sweepAngle) * 180) / Math.PI,
        ((next.startAngle + next.sweepAngle) * 180) / Math.PI,
      );
    }
  } else if (old.type === 'ELLIPSE' && next.type === 'ELLIPSE') {
    put('center', tuple(old.center), tuple(next.center));
    put('majorAxis', tuple(old.majorAxis), tuple(next.majorAxis));
    const oldRatio = magnitude3(old.minorAxis) / magnitude3(old.majorAxis),
      ratio = magnitude3(next.minorAxis) / magnitude3(next.majorAxis);
    if (Math.abs(oldRatio - ratio) > 1e-12) fields.ratio = ratio;
    put('startParameter', old.startParameter, next.startParameter);
    put(
      'endParameter',
      old.startParameter + old.sweepParameter,
      next.startParameter + next.sweepParameter,
    );
  } else if (
    (old.type === 'XLINE' || old.type === 'RAY') &&
    (next.type === 'XLINE' || next.type === 'RAY')
  ) {
    put('basePoint', tuple(old.basePoint), tuple(next.basePoint));
    put('direction', tuple(old.direction), tuple(next.direction));
  } else if (old.type === 'SPLINE' && next.type === 'SPLINE') {
    for (const key of ['controlPoints', 'fitPoints'] as const)
      put(key, old[key].map(tuple), next[key].map(tuple));
    for (const key of ['degree', 'knots', 'weights', 'fitTolerance'] as const)
      put(key, old[key], structuredClone(next[key]) as JsonValue);
    for (const key of ['startTangent', 'endTangent'] as const)
      put(key, old[key] ? tuple(old[key]!) : null, next[key] ? tuple(next[key]!) : null);
    if (
      old.closed !== next.closed ||
      old.periodic !== next.periodic ||
      !same(old.weights, next.weights)
    )
      fields.flags =
        (Number(original.flags ?? 0) & ~7) |
        (next.closed ? 1 : 0) |
        (next.periodic ? 2 : 0) |
        (next.weights.some((weight) => weight !== 1) ? 4 : 0);
  } else throw new Error('Native geometry conversion is unavailable.');
  if (
    Object.keys(fields).length &&
    geometryFromFields(object.type, nativeEditedFields(original, fields)).status !== 'ok'
  )
    throw new Error('The edited native geometry is invalid.');
  return [{ handle: object.handle, fields }];
}
