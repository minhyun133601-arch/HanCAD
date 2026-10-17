import { entityFields } from '@hancad/db';
import type {
  DatabaseTransaction,
  DrawingDatabase,
  JsonObject,
  JsonValue,
  NewDatabaseObject,
} from '@hancad/db';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

const marker = 'hancadClipboardBlock';
function position(point: CadPoint, base: CadPoint): JsonValue[] {
  return [point.x - base.x, -(point.y - base.y), (point.z ?? 0) - (base.z ?? 0)];
}
function geometryFields(entity: CadEntity, base: CadPoint): JsonObject {
  switch (entity.type) {
    case 'line':
      return { start: position(entity.a, base), end: position(entity.b, base) };
    case 'circle':
      return { center: position(entity.center, base), radius: entity.radius };
    case 'arc':
      return {
        center: position(entity.center, base),
        radius: entity.radius,
        startAngle: (-(entity.clockwise ? entity.endAngle : entity.startAngle) * 180) / Math.PI,
        endAngle: (-(entity.clockwise ? entity.startAngle : entity.endAngle) * 180) / Math.PI,
      };
    case 'text':
      return {
        insertionPoint: position(entity.point, base),
        text: entity.text,
        height: entity.textSize,
        rotation: (-entity.rotation * 180) / Math.PI,
      };
    case 'polyline':
    case 'rect':
      return {
        flags: entity.closed ? 1 : 0,
        vertices: entity.points.map((point, index) => ({
          position: position(point, base),
          bulge: -(entity.bulges?.[index] ?? 0),
        })),
      };
    case 'dimension':
      return {
        dimensionType: entity.kind,
        ...(entity.a ? { extensionPoint1: position(entity.a, base) } : {}),
        ...(entity.b ? { extensionPoint2: position(entity.b, base) } : {}),
        ...(entity.center ? { center: position(entity.center, base) } : {}),
        ...(entity.placement ? { definitionPoint: position(entity.placement, base) } : {}),
        text: entity.text ?? '',
        textHeight: entity.textSize,
      };
  }
}

/** Called inside the same transaction that publishes the replacement view for one undo step. */
export function syncClipboardBlockRecords(
  database: DrawingDatabase,
  tx: DatabaseTransaction,
  state: LegacyCadState,
): void {
  const blocks = state.clipboardBlocks ?? [],
    names = new Set(blocks.map((block) => block.name));
  const all = database.all(true);
  if (!blocks.length && !all.some((object) => object.fields[marker])) return;
  const byId = new Map(state.entities.map((entity) => [entity.id, entity]));
  for (const object of all)
    if (
      typeof object.fields[marker] === 'string' &&
      !names.has(String(object.fields[marker])) &&
      !object.erased
    )
      tx.erase(object.handle);
  const model = database.find('BLOCK_RECORD', '*Model_Space');
  if (!model) return;
  for (const block of blocks) {
    let record = all.find(
      (object) => object.type === 'BLOCK_RECORD' && object.fields[marker] === block.name,
    );
    const entities = block.entityIds.flatMap((id) => {
      const entity = byId.get(id);
      return entity ? [entity] : [];
    });
    const signature = JSON.stringify([block, entities]);
    if (record && !record.erased && record.fields.hancadClipboardSignature === signature) continue;
    if (!record)
      record = tx.add({
        type: 'BLOCK_RECORD',
        name: block.name,
        owner: database.tables.BLOCK_RECORD,
        fields: { [marker]: block.name, units: 4 },
      });
    else if (record.erased) tx.unerase(record.handle);
    tx.modify(record.handle, (object) => {
      object.fields.hancadClipboardSignature = signature;
    });
    const retained = new Set([record.handle]);
    function upsert(input: NewDatabaseObject): void {
      const entityId = input.fields?.hancadClipboardEntityId;
      const candidates = all.filter(
        (object) =>
          object.fields[marker] === block.name &&
          (typeof entityId === 'string'
            ? object.fields.hancadClipboardEntityId === entityId
            : object.type === input.type && object.fields.hancadClipboardEntityId === undefined),
      );
      const existing = candidates.find((object) => !object.erased) ?? candidates[0];
      if (!existing) {
        retained.add(tx.add(input).handle);
        return;
      }
      if (existing.erased) tx.unerase(existing.handle);
      tx.modify(existing.handle, (object) => {
        object.type = input.type;
        object.owner = input.owner ?? null;
        object.fields = input.fields ?? {};
        if (input.name !== undefined) object.name = input.name;
      });
      retained.add(existing.handle);
    }
    upsert({
      type: 'BLOCK',
      owner: record.handle,
      name: block.name,
      fields: { [marker]: block.name, name: block.name, basePoint: [0, 0, 0] },
    });
    for (const entity of entities) {
      const fields = entityFields({
        ...geometryFields(entity, block.basePoint),
        [marker]: block.name,
        hancadClipboardEntityId: entity.id,
        // Transitional dimensions remain fully recoverable before complete DXF DIMENSION authoring.
        hancadClipboardGeometry: JSON.parse(JSON.stringify(entity)) as JsonValue,
        layer: entity.layer,
        color: entity.aci ?? 256,
        ...(entity.trueColor !== undefined ? { trueColor: entity.trueColor } : {}),
        linetype: entity.linetype ?? 'BYLAYER',
        linetypeScale: entity.linetypeScale ?? 1,
        lineweight: entity.lineweight ?? -1,
      });
      upsert({
        type:
          entity.type === 'polyline' || entity.type === 'rect'
            ? 'LWPOLYLINE'
            : entity.type.toUpperCase(),
        owner: record.handle,
        fields,
      });
    }
    upsert({ type: 'ENDBLK', owner: record.handle, fields: { [marker]: block.name } });
    upsert({
      type: 'INSERT',
      owner: model.handle,
      fields: entityFields({
        [marker]: block.name,
        blockName: block.name,
        insertionPoint: [block.basePoint.x, -block.basePoint.y, block.basePoint.z ?? 0],
        scale: [1, 1, 1],
        rotation: 0,
      }),
    });
    for (const object of all)
      if (object.fields[marker] === block.name && !retained.has(object.handle) && !object.erased)
        tx.erase(object.handle);
  }
}
