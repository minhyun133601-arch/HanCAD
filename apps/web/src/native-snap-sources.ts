import type { DatabaseObject, DrawingDatabase } from '@hancad/db';
import { geometryFromFields, objectAxes, transformGeometry, transformPoint3 } from '@hancad/geom';
import type { Affine3, Vec3 } from '@hancad/geom';
import { legacySnapSources, SnapIndex } from '@hancad/draft';
import type { SnapSource } from '@hancad/draft';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { nativeHatchSnapCurves } from './native-hatch-snap-sources';

/** Native curves keep weights, bulges, ellipse axes and elevation through point acquisition. */
export function nativeSnapSources(
  objects: readonly DatabaseObject[],
  legacy?: LegacyCadState,
): SnapSource[] {
  const active = objects.filter((object) => !object.erased),
    byOwner = new Map<string, DatabaseObject[]>();
  for (const object of active)
    if (object.owner) {
      const siblings = byOwner.get(object.owner) ?? [];
      siblings.push(object);
      byOwner.set(object.owner, siblings);
    }
  const model = active.find(
    (object) => object.type === 'BLOCK_RECORD' && object.name?.toUpperCase() === '*MODEL_SPACE',
  );
  if (!model) return [];
  const blocks = new Map(
    active
      .filter((object) => object.type === 'BLOCK_RECORD' && object.name)
      .map((object) => [object.name!.toUpperCase(), object]),
  );
  const hidden = new Set(
    active
      .filter(
        (object) =>
          object.type === 'LAYER' &&
          (object.fields.visible === false ||
            number(object, 'color', 62, 7) < 0 ||
            number(object, 'flags', 70, 0) & 1),
      )
      .map((object) => object.name),
  );
  for (const layer of legacy?.layers ?? [])
    if (!layer.visible) hidden.add(layer.name);
    else hidden.delete(layer.name);
  const visible = (object: DatabaseObject, inheritLayer?: string): boolean => {
    const layer =
      typeof object.fields.layer === 'string'
        ? object.fields.layer
        : (groupString(object, 8) ?? '0');
    return (
      object.fields.visible !== false &&
      number(object, 'visibility', 60, 0) !== 1 &&
      !hidden.has(layer === '0' && inheritLayer ? inheritLayer : layer)
    );
  };
  const sources: SnapSource[] = [];
  function visit(
    object: DatabaseObject,
    matrix?: Affine3,
    path = '',
    parentEntity?: string,
    stack: readonly string[] = [],
    inheritLayer?: string,
  ): void {
    if (!visible(object, inheritLayer)) return;
    const id = path ? `${path}/${object.handle}` : object.handle,
      entityId = parentEntity ?? object.handle;
    if (['INSERT', 'TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(object.type)) {
      const local = point(object, ['insertionPoint', 'position', 'insertion'], 10);
      if (local) {
        const normal = point(object, ['extrusion'], 210) ?? { x: 0, y: 0, z: 1 },
          axes = objectAxes(normal);
        const wcs =
          object.type === 'MTEXT'
            ? local
            : {
                x: axes.x.x * local.x + axes.y.x * local.y + axes.z.x * local.z,
                y: axes.x.y * local.x + axes.y.y * local.y + axes.z.y * local.z,
                z: axes.x.z * local.x + axes.y.z * local.y + axes.z.z * local.z,
              };
        const insertion = matrix ? transformPoint3(matrix, wcs) : wcs;
        sources.push({
          id,
          entityId,
          node: false,
          insertion,
          geometry: { type: 'POINT', position: insertion },
        });
      }
      if (object.type !== 'INSERT') return;
      const name =
        typeof object.fields.blockName === 'string'
          ? object.fields.blockName
          : typeof object.fields.name === 'string'
            ? object.fields.name
            : groupString(object, 2);
      const record = name ? blocks.get(name.toUpperCase()) : undefined;
      if (!record || stack.includes(record.handle)) return;
      const begin = byOwner.get(record.handle)?.find((child) => child.type === 'BLOCK'),
        base = begin ? point(begin, ['basePoint'], 10) : undefined;
      const localMatrix = insertMatrix(object, base ?? { x: 0, y: 0, z: 0 });
      if (!localMatrix) return;
      const combined = matrix ? multiply(matrix, localMatrix) : localMatrix;
      const layer =
        typeof object.fields.layer === 'string'
          ? object.fields.layer
          : (groupString(object, 8) ?? '0');
      for (const child of byOwner.get(record.handle) ?? [])
        visit(
          child,
          combined,
          id,
          entityId,
          [...stack, record.handle],
          layer === '0' ? inheritLayer : layer,
        );
      return;
    }
    if (object.type === 'DIMENSION') {
      const definitionFields: readonly (readonly [number, readonly string[]])[] = [
        [10, ['definitionPoint']],
        [11, ['textMidpoint', 'textPoint']],
        [13, ['definitionPoint1', 'firstExtensionPoint']],
        [14, ['definitionPoint2', 'secondExtensionPoint']],
        [15, ['definitionPoint3', 'centerPoint']],
        [16, ['definitionPoint4', 'arcPoint']],
      ];
      for (const [code, names] of definitionFields) {
        const local = point(object, names, code);
        if (!local) continue;
        const axes = objectAxes(point(object, ['extrusion'], 210) ?? { x: 0, y: 0, z: 1 });
        const wcs =
          code === 11
            ? {
                x: axes.x.x * local.x + axes.y.x * local.y + axes.z.x * local.z,
                y: axes.x.y * local.x + axes.y.y * local.y + axes.z.y * local.z,
                z: axes.x.z * local.x + axes.y.z * local.y + axes.z.z * local.z,
              }
            : local;
        const position = matrix ? transformPoint3(matrix, wcs) : wcs;
        sources.push({
          id: `${id}:definition:${code}`,
          entityId,
          geometry: { type: 'POINT', position },
        });
      }
      const name =
          typeof object.fields.blockName === 'string'
            ? object.fields.blockName
            : groupString(object, 2),
        record = name ? blocks.get(name.toUpperCase()) : undefined;
      if (record && !stack.includes(record.handle))
        for (const child of byOwner.get(record.handle) ?? [])
          visit(child, matrix, id, entityId, [...stack, record.handle], inheritLayer);
      return;
    }
    if (object.type === 'HATCH') {
      for (const [index, geometry] of nativeHatchSnapCurves(object).entries())
        sources.push({
          id: `${id}:hatch:${index}`,
          entityId,
          hatch: true,
          geometry: matrix ? transformGeometry(geometry, matrix) : geometry,
        });
      return;
    }
    const fields =
      object.type === 'POLYLINE' && object.fields.vertices === undefined
        ? {
            ...object.fields,
            vertices: (byOwner.get(object.handle) ?? [])
              .filter((child) => child.type === 'VERTEX')
              .map((child) => child.fields),
          }
        : object.fields;
    const parsed = geometryFromFields(object.type, fields);
    if (parsed.status !== 'ok') return;
    sources.push({
      id,
      entityId,
      geometry: matrix ? transformGeometry(parsed.geometry, matrix) : parsed.geometry,
      ...(object.fields.dimensionExtension === true ? { dimensionExtension: true } : {}),
    });
  }
  for (const object of byOwner.get(model.handle) ?? []) visit(object);
  return sources;
}
export function drawingSnapSources(
  database: DrawingDatabase,
  state: LegacyCadState,
  additionalEntities: readonly CadEntity[] = [],
): SnapSource[] {
  const merged = new Map(
    nativeSnapSources(database.all(), state).map((source) => [source.id, source]),
  );
  for (const source of legacySnapSources(state, additionalEntities)) merged.set(source.id, source);
  return [...merged.values()];
}
export function createDrawingSnapIndex(
  database: DrawingDatabase,
  state: LegacyCadState,
  additionalEntities: readonly CadEntity[] = [],
): SnapIndex {
  return new SnapIndex(drawingSnapSources(database, state, additionalEntities));
}
function groupString(object: DatabaseObject, code: number): string | undefined {
  const value = object.groups.find((group) => group.code === code)?.value;
  return typeof value === 'string' ? value : undefined;
}
function number(object: DatabaseObject, name: string, code: number, fallback: number): number {
  const value = object.fields[name] ?? object.groups.find((group) => group.code === code)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function point(object: DatabaseObject, names: readonly string[], code: number): Vec3 | undefined {
  const value = names.map((name) => object.fields[name]).find((value) => Array.isArray(value));
  if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number')
    return { x: value[0], y: value[1], z: typeof value[2] === 'number' ? value[2] : 0 };
  const x = object.groups.find((group) => group.code === code)?.value,
    y = object.groups.find((group) => group.code === code + 10)?.value,
    z = object.groups.find((group) => group.code === code + 20)?.value;
  return typeof x === 'number' && typeof y === 'number'
    ? { x, y, z: typeof z === 'number' ? z : 0 }
    : undefined;
}
function insertMatrix(object: DatabaseObject, base: Vec3): Affine3 | undefined {
  const insertion = point(object, ['insertionPoint', 'position', 'insertion'], 10);
  if (!insertion) return;
  const normal = point(object, ['extrusion'], 210) ?? { x: 0, y: 0, z: 1 },
    axes = objectAxes(normal),
    rotation = (number(object, 'rotation', 50, 0) * Math.PI) / 180;
  const sx = number(object, 'scaleX', 41, 1),
    sy = number(object, 'scaleY', 42, 1),
    sz = number(object, 'scaleZ', 43, 1);
  if (sx === 0 || sy === 0 || sz === 0) return;
  const c = Math.cos(rotation),
    s = Math.sin(rotation);
  const x = {
    x: (axes.x.x * c + axes.y.x * s) * sx,
    y: (axes.x.y * c + axes.y.y * s) * sx,
    z: (axes.x.z * c + axes.y.z * s) * sx,
  };
  const y = {
    x: (-axes.x.x * s + axes.y.x * c) * sy,
    y: (-axes.x.y * s + axes.y.y * c) * sy,
    z: (-axes.x.z * s + axes.y.z * c) * sy,
  };
  const z = { x: axes.z.x * sz, y: axes.z.y * sz, z: axes.z.z * sz };
  const p = {
    x: axes.x.x * insertion.x + axes.y.x * insertion.y + axes.z.x * insertion.z,
    y: axes.x.y * insertion.x + axes.y.y * insertion.y + axes.z.y * insertion.z,
    z: axes.x.z * insertion.x + axes.y.z * insertion.y + axes.z.z * insertion.z,
  };
  return [
    x.x,
    y.x,
    z.x,
    p.x - x.x * base.x - y.x * base.y - z.x * base.z,
    x.y,
    y.y,
    z.y,
    p.y - x.y * base.x - y.y * base.y - z.y * base.z,
    x.z,
    y.z,
    z.z,
    p.z - x.z * base.x - y.z * base.y - z.z * base.z,
  ];
}
function multiply(a: Affine3, b: Affine3): Affine3 {
  const out: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 4; column++)
      out.push(
        a[row * 4]! * b[column]! +
          a[row * 4 + 1]! * b[4 + column]! +
          a[row * 4 + 2]! * b[8 + column]! +
          (column === 3 ? a[row * 4 + 3]! : 0),
      );
  return out as unknown as Affine3;
}
