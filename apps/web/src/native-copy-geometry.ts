import { decodeDxfFields } from '@hancad/db';
import type { DatabaseObject, JsonObject, JsonValue } from '@hancad/db';
import {
  dot3,
  geometryFromFields,
  objectAxes,
  transformGeometry,
  transformPoint3,
} from '@hancad/geom';
import type { Affine3, Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { nativeRawPoint, translateNativeHelixRaw, writeNativeRawPoint } from './native-copy-raw';

type FieldWriter = (object: DatabaseObject, fields: JsonObject) => void;
export interface NativeGeometryCopy {
  object: DatabaseObject;
  ownedObjects: DatabaseObject[];
}
const fieldsOf = (object: DatabaseObject): JsonObject => ({
  ...decodeDxfFields(object.type, object.groups),
  ...structuredClone(object.fields),
});
function point(value: JsonValue | undefined): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !value.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
    throw new Error('네이티브 객체의 위치 정의를 확인할 수 없습니다.');
  return { x: Number(value[0]), y: Number(value[1]), z: Number(value[2] ?? 0) };
}
const array = (p: Vec3): number[] => [p.x, p.y, p.z];
function records(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value) || value.some((v) => !v || Array.isArray(v) || typeof v !== 'object'))
    throw new Error('네이티브 폴리선 정점을 확인할 수 없습니다.');
  return value as JsonObject[];
}
function opaquePoint(object: DatabaseObject, fields: JsonObject): JsonValue | undefined {
  const existing = fields.insertionPoint ?? fields.position;
  if (existing !== undefined) return existing;
  return nativeRawPoint(object, 10, object.type === 'TEXT' ? 'AcDbText' : 'AcDbBlockReference');
}

/** Translate a detached graph without changing source handles or refitting geometry. */
export function translateNativeCopy(
  source: DatabaseObject,
  delta: CadPoint,
  objects: readonly DatabaseObject[],
  write: FieldWriter,
): NativeGeometryCopy {
  const object = structuredClone(source),
    ownedObjects: DatabaseObject[] = [];
  const d = { x: delta.x, y: -delta.y, z: delta.z ?? 0 };
  if (![d.x, d.y, d.z].every(Number.isFinite)) throw new Error('유효한 복사 변위가 필요합니다.');
  if (!d.x && !d.y && !d.z) return { object, ownedObjects };
  const fields = fieldsOf(source);
  if (fields.extrusion === undefined && source.groups.some((group) => group.code === 210))
    fields.extrusion = [210, 220, 230].map(
      (code, i) => source.groups.find((group) => group.code === code)?.value ?? (i === 2 ? 1 : 0),
    );
  const normal = fields.extrusion === undefined ? { x: 0, y: 0, z: 1 } : point(fields.extrusion);
  const axes = objectAxes(normal);
  const local = { x: dot3(axes.x, d), y: dot3(axes.y, d), z: dot3(axes.z, d) };
  const matrix: Affine3 = [1, 0, 0, d.x, 0, 1, 0, d.y, 0, 0, 1, d.z];
  const moved = (value: JsonValue | undefined, ocs = false): number[] => {
    const p = point(value),
      shift = ocs ? local : d;
    return [p.x + shift.x, p.y + shift.y, p.z + shift.z];
  };
  if (source.type === 'INSERT' || source.type === 'TEXT') {
    const insertion = opaquePoint(source, fields);
    const patch: JsonObject = { insertionPoint: moved(insertion, true) };
    const alignment =
      fields.alignmentPoint ??
      (source.type === 'TEXT' ? nativeRawPoint(source, 11, 'AcDbText') : undefined);
    if (alignment !== undefined) patch.alignmentPoint = moved(alignment, true);
    write(object, patch);
    if (source.type === 'TEXT') {
      writeNativeRawPoint(object, 10, patch.insertionPoint as number[], 'AcDbText');
      if (patch.alignmentPoint)
        writeNativeRawPoint(object, 11, patch.alignmentPoint as number[], 'AcDbText');
    }
    return { object, ownedObjects };
  }
  const owned = objects.filter(
    (child) => !child.erased && child.owner === source.handle && child.type === 'VERTEX',
  );
  if (source.type === 'POLYLINE' && fields.vertices === undefined)
    fields.vertices = owned.map(fieldsOf);
  const parsed = geometryFromFields(source.type, fields);
  if (parsed.status !== 'ok')
    throw new Error(`이 네이티브 객체의 변위 복사는 아직 지원하지 않습니다: ${source.type}`);
  const transformed = transformGeometry(parsed.geometry, matrix);
  const patch: JsonObject = {};
  switch (transformed.type) {
    case 'LINE':
      patch.start = array(transformed.start);
      patch.end = array(transformed.end);
      break;
    case 'POINT':
      patch.position = array(transformed.position);
      break;
    case 'XLINE':
    case 'RAY':
      patch.basePoint = array(transformed.basePoint);
      break;
    case 'CIRCLE':
    case 'ARC':
      patch.center = moved(fields.center, true);
      break;
    case 'ELLIPSE':
      patch.center = array(transformed.center);
      break;
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const is3D = transformed.is3D;
      const translateVertex = (vertex: JsonObject): JsonObject => {
        const p = point(vertex.position);
        return {
          ...vertex,
          position: is3D
            ? array(transformPoint3(matrix, p))
            : source.type === 'LWPOLYLINE'
              ? [p.x + local.x, p.y + local.y]
              : [p.x + local.x, p.y + local.y, p.z],
        };
      };
      if (source.type === 'LWPOLYLINE' || source.fields.vertices !== undefined)
        patch.vertices = records(fields.vertices).map(translateVertex);
      if (!is3D) {
        const elevation = Number(
          fields.elevation ?? (Array.isArray(fields.position) ? (fields.position[2] ?? 0) : 0),
        );
        if (source.type === 'LWPOLYLINE' || source.fields.elevation !== undefined)
          patch.elevation = elevation + local.z;
        if (source.type === 'POLYLINE') {
          const header =
            fields.position === undefined ? { x: 0, y: 0, z: elevation } : point(fields.position);
          patch.position = [header.x, header.y, elevation + local.z];
        }
      }
      for (const child of owned) {
        const copy = structuredClone(child),
          next = translateVertex(fieldsOf(child));
        write(copy, { position: next.position! });
        ownedObjects.push(copy);
      }
      break;
    }
    case 'SPLINE':
      for (const name of ['controlPoints', 'fitPoints'] as const) {
        const points = fields[name];
        if (Array.isArray(points)) patch[name] = points.map((p) => moved(p));
      }
      break;
    case 'TRANSFORMED':
      if (parsed.geometry.type !== 'HELIX')
        throw new Error('네이티브 변환 형상을 저장할 수 없습니다.');
      patch.center = array(transformPoint3(matrix, parsed.geometry.center));
      break;
    case 'HELIX':
      patch.center = array(transformed.center);
      break;
  }
  write(object, patch);
  if (source.type === 'HELIX') translateNativeHelixRaw(object, d);
  return { object, ownedObjects };
}
