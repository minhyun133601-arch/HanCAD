import type { DatabaseObject, JsonValue } from '@hancad/db';
import { geometryFromFields, multiplyAffine3, objectAxes, transformGeometry } from '@hancad/geom';
import type { Affine3, Vec3 } from '@hancad/geom';
import { colorFromDxf, transparencyFromDxf } from '../style/aci';
import { resolveInheritedStyle } from '../style/inheritance';
import type { InheritableStyle, InheritedLayerStyle } from '../style/inheritance';
import type { DisplayEntity } from '../display/types';
import { displayGeometryFromCurve } from './database-source';

export interface BlockDisplayDiagnostic {
  handle: string;
  reason: string;
}
const identity: Affine3 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function field(
  object: DatabaseObject,
  names: readonly string[],
  code: number,
): JsonValue | undefined {
  for (const name of names) if (object.fields[name] !== undefined) return object.fields[name];
  return object.groups.find((group) => group.code === code)?.value;
}
function number(
  object: DatabaseObject,
  names: readonly string[],
  code: number,
  fallback: number,
): number {
  const value = field(object, names, code);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function point(
  object: DatabaseObject,
  names: readonly string[],
  code: number,
  fallback: Vec3,
): Vec3 {
  const value = field(object, names, code);
  if (Array.isArray(value))
    return {
      x: Number(value[0] ?? fallback.x),
      y: Number(value[1] ?? fallback.y),
      z: Number(value[2] ?? fallback.z),
    };
  return {
    x: number(object, [], code, fallback.x),
    y: number(object, [], code + 10, fallback.y),
    z: number(object, [], code + 20, fallback.z),
  };
}
function style(object: DatabaseObject): InheritableStyle {
  const layer = field(object, ['layer'], 8),
    linetype = field(object, ['linetype'], 6);
  const trueColor = field(object, ['trueColor'], 420);
  return {
    layer: typeof layer === 'string' ? layer : '0',
    color: colorFromDxf(
      number(object, ['color'], 62, 256),
      typeof trueColor === 'number' ? trueColor : undefined,
    ),
    linetype: typeof linetype === 'string' ? linetype : 'BYLAYER',
    lineweight: number(object, ['lineweight'], 370, -1),
    transparency: transparencyFromDxf(number(object, ['transparency'], 440, 0)),
  };
}
function insertionMatrix(insert: DatabaseObject, base: Vec3): Affine3 {
  const p = point(insert, ['insertionPoint', 'position'], 10, { x: 0, y: 0, z: 0 });
  const scales = point(insert, ['scale'], 41, { x: 1, y: 1, z: 1 });
  const sx = number(insert, ['scaleX', 'xScale'], 41, scales.x),
    sy = number(
      insert,
      ['scaleY', 'yScale'],
      42,
      Array.isArray(insert.fields.scale) ? scales.y : 1,
    ),
    sz = number(
      insert,
      ['scaleZ', 'zScale'],
      43,
      Array.isArray(insert.fields.scale) ? scales.z : 1,
    );
  const angle = (number(insert, ['rotation'], 50, 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const axes = objectAxes(point(insert, ['extrusion'], 210, { x: 0, y: 0, z: 1 }));
  const local: Affine3 = [
    c * sx,
    -s * sy,
    0,
    p.x - c * sx * base.x + s * sy * base.y,
    s * sx,
    c * sy,
    0,
    p.y - s * sx * base.x - c * sy * base.y,
    0,
    0,
    sz,
    p.z - sz * base.z,
  ];
  const orientation: Affine3 = [
    axes.x.x,
    axes.y.x,
    axes.z.x,
    0,
    axes.x.y,
    axes.y.y,
    axes.z.y,
    0,
    axes.x.z,
    axes.y.z,
    axes.z.z,
    0,
  ];
  return multiplyAffine3(orientation, local);
}

/** Expands only top-level model-space INSERTs; definition objects are never drawn on their own. */
export function databaseBlockDisplayEntities(
  objects: readonly DatabaseObject[],
  layers: ReadonlyMap<string, InheritedLayerStyle>,
  lwdefault = 25,
  report?: (diagnostic: BlockDisplayDiagnostic) => void,
): DisplayEntity[] {
  const byHandle = new Map(objects.filter((o) => !o.erased).map((o) => [o.handle, o]));
  const definitions = new Map(
    objects
      .filter((o) => o.type === 'BLOCK_RECORD' && !o.erased && o.name)
      .map((o) => [o.name!.toUpperCase(), o]),
  );
  const children = new Map<string, DatabaseObject[]>();
  for (const object of objects)
    if (!object.erased && object.owner) {
      const list = children.get(object.owner) ?? [];
      list.push(object);
      children.set(object.owner, list);
    }
  const entities: DisplayEntity[] = [];
  const diagnostic = (object: DatabaseObject, reason: string): void =>
    report?.({ handle: object.handle, reason });
  function visit(
    insert: DatabaseObject,
    matrix: Affine3,
    inserts: readonly InheritableStyle[],
    path: readonly string[],
    root: string,
    instances: readonly string[],
  ): void {
    const name = field(insert, ['blockName', 'name'], 2),
      handle = field(insert, ['blockRecord'], 340);
    const block =
      typeof handle === 'string'
        ? byHandle.get(handle)
        : typeof name === 'string'
          ? definitions.get(name.toUpperCase())
          : undefined;
    if (!block || block.type !== 'BLOCK_RECORD') {
      diagnostic(insert, 'Missing block definition.');
      return;
    }
    if (path.includes(block.handle) || path.length >= 64) {
      diagnostic(insert, 'Cyclic or excessively nested block definition.');
      return;
    }
    if (insert.fields.visible === false || number(insert, [], 60, 0) !== 0) return;
    if (number(insert, ['columns'], 70, 1) > 1 || number(insert, ['rows'], 71, 1) > 1) {
      diagnostic(insert, 'Block arrays require the later block-editing phase.');
      return;
    }
    const blockChildren = children.get(block.handle) ?? [];
    const begin = blockChildren.find((o) => o.type === 'BLOCK');
    const base = begin
      ? point(begin, ['basePoint'], 10, { x: 0, y: 0, z: 0 })
      : point(block, ['basePoint'], 10, { x: 0, y: 0, z: 0 });
    let transform: Affine3;
    try {
      transform = multiplyAffine3(matrix, insertionMatrix(insert, base));
    } catch {
      diagnostic(insert, 'Invalid insertion transform.');
      return;
    }
    const chain = [...inserts, style(insert)],
      nextPath = [...path, block.handle],
      nextInstances = [...instances, insert.handle];
    for (const child of blockChildren) {
      if (child.type === 'INSERT') {
        visit(child, transform, chain, nextPath, root, nextInstances);
        continue;
      }
      if (['BLOCK', 'ENDBLK', 'VERTEX', 'SEQEND'].includes(child.type)) continue;
      if (child.fields.visible === false) continue;
      const fields =
        child.type === 'POLYLINE' && child.fields.vertices === undefined
          ? {
              ...child.fields,
              vertices: (children.get(child.handle) ?? [])
                .filter((o) => o.type === 'VERTEX')
                .map((o) => o.fields),
            }
          : child.fields;
      const parsed = geometryFromFields(child.type, fields);
      if (parsed.status !== 'ok') {
        diagnostic(child, `Unsupported or invalid block child: ${child.type}.`);
        continue;
      }
      const inherited = resolveInheritedStyle(style(child), chain, layers, lwdefault);
      try {
        entities.push({
          id: `${nextInstances.join('/')}/${child.handle}`,
          sourceId: root,
          ...inherited,
          geometry: displayGeometryFromCurve(transformGeometry(parsed.geometry, transform)),
          linetypeScale: number(child, ['linetypeScale'], 48, 1),
          plinegen: child.fields.plinegen === true || (number(child, ['flags'], 70, 0) & 128) !== 0,
        });
      } catch {
        diagnostic(child, 'Invalid transformed block geometry.');
      }
    }
  }
  for (const object of objects) {
    if (object.erased || object.type !== 'INSERT') continue;
    const owner = object.owner ? byHandle.get(object.owner) : undefined;
    if (owner?.type === 'BLOCK_RECORD' && owner.name?.toUpperCase() !== '*MODEL_SPACE') continue;
    visit(object, identity, [], [], object.handle, []);
  }
  return entities;
}
