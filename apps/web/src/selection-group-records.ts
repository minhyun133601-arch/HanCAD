import { entityFields } from '@hancad/db';
import type {
  DatabaseObject,
  DatabaseTransaction,
  DrawingDatabase,
  JsonObject,
  JsonValue,
} from '@hancad/db';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

export const selectionEntityMarker = 'hancadSelectionEntityId';
const groupMarker = 'hancadSelectionGroup';
const groupIdentityMarker = 'hancadSelectionGroupId';
const point = (p: CadPoint): number[] => [p.x, p.y === 0 ? 0 : -p.y, p.z ?? 0];
function fields(entity: CadEntity): JsonObject {
  switch (entity.type) {
    case 'line':
      return { start: point(entity.a), end: point(entity.b) };
    case 'circle':
      return { center: point(entity.center), radius: entity.radius };
    case 'arc':
      return {
        center: point(entity.center),
        radius: entity.radius,
        startAngle: (-(entity.clockwise ? entity.endAngle : entity.startAngle) * 180) / Math.PI,
        endAngle: (-(entity.clockwise ? entity.startAngle : entity.endAngle) * 180) / Math.PI,
      };
    case 'text':
      return {
        insertionPoint: point(entity.point),
        text: entity.text,
        height: entity.textSize,
        rotation: (-entity.rotation * 180) / Math.PI,
      };
    case 'polyline':
    case 'rect':
      return {
        flags: entity.closed ? 1 : 0,
        vertices: entity.points.map((p, index) => ({
          position: point(p),
          bulge: -(entity.bulges?.[index] ?? 0),
        })),
      };
    case 'dimension':
      return {
        dimensionType: entity.kind,
        ...(entity.a ? { extensionPoint1: point(entity.a) } : {}),
        ...(entity.b ? { extensionPoint2: point(entity.b) } : {}),
        ...(entity.center ? { center: point(entity.center) } : {}),
        ...(entity.placement ? { definitionPoint: point(entity.placement) } : {}),
        text: entity.text ?? '',
        textHeight: entity.textSize,
      };
  }
}
/** Native GROUP references and their reciprocal reactors share the view's command transaction. */
export function syncSelectionGroupRecords(
  database: DrawingDatabase,
  tx: DatabaseTransaction,
  state: LegacyCadState,
): void {
  const all = database.all(true);
  if (
    !state.groups?.length &&
    !all.some((object) => object.fields[groupMarker] || object.fields[selectionEntityMarker])
  )
    return;
  const dictionary = database.find('DICTIONARY', 'ACAD_GROUP');
  const model = database.find('BLOCK_RECORD', '*Model_Space');
  if (!dictionary || !model) return;
  const groups = state.groups ?? [];
  const names = new Set(groups.map((group) => group.id ?? group.name));
  const memberIds = new Set(groups.flatMap((group) => group.ids));
  const entities = new Map(state.entities.map((entity) => [entity.id, entity]));
  const members = new Map<string, DatabaseObject>();
  for (const object of all) {
    const id = object.fields[selectionEntityMarker],
      name = object.fields[groupMarker];
    if (
      (typeof id === 'string' && (!memberIds.has(id) || !entities.has(id))) ||
      (typeof name === 'string' && !names.has(String(object.fields[groupIdentityMarker] ?? name)))
    ) {
      if (!object.erased) tx.erase(object.handle);
    }
  }
  for (const id of memberIds) {
    const entity = entities.get(id);
    if (!entity) continue;
    const signature = JSON.stringify(entity);
    const existing = all.find((object) => object.fields[selectionEntityMarker] === id);
    const data = entityFields({
      ...fields(entity),
      [selectionEntityMarker]: id,
      hancadSelectionSignature: signature,
      hancadSelectionGeometry: JSON.parse(signature) as JsonValue,
      layer: entity.layer,
      color: entity.aci ?? 256,
      ...(entity.trueColor === undefined ? {} : { trueColor: entity.trueColor }),
      linetype: entity.linetype ?? 'BYLAYER',
      linetypeScale: entity.linetypeScale ?? 1,
      lineweight: entity.lineweight ?? -1,
    });
    if (!existing)
      members.set(
        id,
        tx.add({
          type:
            entity.type === 'polyline' || entity.type === 'rect'
              ? 'LWPOLYLINE'
              : entity.type.toUpperCase(),
          owner: model.handle,
          fields: data,
        }),
      );
    else {
      if (existing.erased) tx.unerase(existing.handle);
      members.set(
        id,
        existing.fields.hancadSelectionSignature === signature
          ? existing
          : tx.modify(existing.handle, (object) => {
              object.fields = data;
            }),
      );
    }
  }
  const records = groups.map((group) => {
    const data: JsonObject = {
      [groupMarker]: group.name,
      [groupIdentityMarker]: group.id ?? group.name,
      description: group.description,
      unnamed: group.name.startsWith('*') ? 1 : 0,
      selectable: group.selectable ? 1 : 0,
      entities: group.ids.flatMap((id) => {
        const member = members.get(id);
        return member ? [member.handle] : [];
      }),
    };
    const existing = all.find(
      (object) =>
        object.type === 'GROUP' &&
        (object.fields[groupIdentityMarker] === (group.id ?? group.name) ||
          (!object.fields[groupIdentityMarker] && object.fields[groupMarker] === group.name)),
    );
    const record = existing
      ? tx.modify(existing.handle, (object) => {
          object.erased = false;
          object.name = group.name;
          object.fields = data;
        })
      : tx.add({ type: 'GROUP', name: group.name, owner: dictionary.handle, fields: data });
    return { group, record };
  });
  tx.modify(dictionary.handle, (object) => {
    const entries = Array.isArray(object.fields.entries) ? object.fields.entries : [];
    const owned = new Set(
      all
        .filter((candidate) => typeof candidate.fields[groupMarker] === 'string')
        .map((candidate) => candidate.handle),
    );
    object.fields.entries = [
      ...entries.filter(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          !Array.isArray(entry) &&
          !owned.has(String(entry.handle)),
      ),
      ...records.map(({ group, record }) => ({
        name: group.name,
        handle: record.handle,
        hardOwner: true,
      })),
    ];
  });
  for (const [id, member] of members)
    tx.modify(member.handle, (object) => {
      const owned = new Set(
        all
          .filter((candidate) => typeof candidate.fields[groupMarker] === 'string')
          .map((candidate) => candidate.handle),
      );
      object.reactors = [
        ...object.reactors.filter((reactor) => !owned.has(reactor)),
        ...records.filter(({ group }) => group.ids.includes(id)).map(({ record }) => record.handle),
      ];
    });
}
