import { applyDxfFieldPatch, getDxfObjectSchema } from '@hancad/db';
import type { DrawingDatabase, JsonObject } from '@hancad/db';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { geometryFromFields, magnitude3, subtract3 } from '@hancad/geom';
import { transparencyFromDxf } from '@hancad/render';
import type { SystemVariables } from '@hancad/sysvars';
import { layerStateWithNative } from './layers/layer-records';
import { drawingStyleState } from './drawing-style-state';
import {
  nativeEditedFields,
  nativeGeometryEdits,
  nativeGeometryFields,
} from './native-property-geometry';
import type { NativeGeometryEdit } from './native-property-geometry';

const identities = new WeakMap<
  DrawingDatabase,
  {
    ids: Map<string, string>;
    reserved: Set<string>;
    entities?: readonly CadEntity[];
    entityCount?: number;
  }
>();
const inquiryCaches = new WeakMap<
  DrawingDatabase,
  { source?: LegacyCadState; value?: LegacyCadState }
>();
export function nativePropertyIds(
  database: DrawingDatabase,
  state: LegacyCadState,
): ReadonlyMap<string, string> {
  let allocation = identities.get(database);
  if (!allocation) {
    allocation = { ids: new Map(), reserved: new Set() };
    identities.set(database, allocation);
  }
  if (allocation.entities !== state.entities || allocation.entityCount !== state.entities.length) {
    for (const entity of state.entities) allocation.reserved.add(entity.id);
    allocation.entities = state.entities;
    allocation.entityCount = state.entities.length;
  }
  for (const object of database.all()) {
    if (allocation.ids.has(object.handle)) continue;
    let id = `native:ENTITY:${object.handle}`;
    while (allocation.reserved.has(id)) id += ':';
    allocation.ids.set(object.handle, id);
    allocation.reserved.add(id);
  }
  return allocation.ids;
}
const point = (p: { x: number; y: number; z: number }): CadPoint => ({ x: p.x, y: -p.y, z: p.z });
const wcs = (p: CadPoint) => [p.x, -p.y, p.z ?? 0];

/** Native geometry stays in its owning DB; these inquiry adapters never enter the view journal. */
export function nativePropertyState(
  database: DrawingDatabase,
  state: LegacyCadState,
): LegacyCadState {
  let cache = inquiryCaches.get(database);
  if (!cache) {
    cache = {};
    inquiryCaches.set(database, cache);
    const subscribed = cache;
    database.events.subscribe((event) => {
      if (
        event.type === 'object-added' ||
        event.type === 'object-modified' ||
        event.type === 'object-erased' ||
        event.type === 'object-unerased'
      )
        delete subscribed.value;
    });
  }
  if (cache.source === state && cache.value) return cache.value;
  const model = database.find('BLOCK_RECORD', '*Model_Space')?.handle;
  const ids = nativePropertyIds(database, state);
  const entities: CadEntity[] = [];
  const objects = database.all();
  for (const object of objects) {
    if (
      object.owner !== model ||
      object.fields.hancadClipboardBlock ||
      object.fields.hancadSelectionEntityId ||
      object.fields.visible === false
    )
      continue;
    const f = nativeGeometryFields(object, objects);
    const raw = (name: string, code: number, fallback: string | number) =>
      f[name] ?? object.groups.find((g) => g.code === code)?.value ?? fallback;
    const trueColor = raw('trueColor', 420, -1);
    const aci = Number(raw('color', 62, 256));
    const common = {
      id: ids.get(object.handle)!,
      layer: String(raw('layer', 8, '0')),
      color:
        typeof trueColor === 'number' && trueColor >= 0
          ? `#${trueColor.toString(16).padStart(6, '0')}`
          : '#ffffff',
      lineWidth: 1,
      aci,
      ...(typeof trueColor === 'number' && trueColor >= 0 ? { trueColor } : {}),
      linetype: String(raw('linetype', 6, 'BYLAYER')),
      lineweight: Number(raw('lineweight', 370, -1)),
      linetypeScale: Number(raw('linetypeScale', 48, 1)),
      transparency: transparencyFromDxf(Number(raw('transparency', 440, 0))),
      thickness: Number(raw('thickness', 39, 0)),
      material: String(raw('material', 347, 'ByLayer')),
      plotStyle: String(raw('plotStyle', 390, 'ByLayer')),
      sourceType: object.type,
    };
    const parsed = geometryFromFields(object.type, f);
    if (parsed.status === 'ok') {
      const curve = parsed.geometry;
      if (curve.type === 'LINE')
        entities.push({ ...common, type: 'line', a: point(curve.start), b: point(curve.end) });
      else if (
        curve.type === 'CIRCLE' &&
        curve.normal.z === 1 &&
        curve.normal.x === 0 &&
        curve.normal.y === 0
      )
        entities.push({
          ...common,
          type: 'circle',
          center: point(curve.center),
          radius: curve.radius,
        });
      else entities.push({ ...common, type: 'polyline', points: [], closed: false, curve });
    } else if (
      object.type === 'INSERT' ||
      (getDxfObjectSchema(object.type)?.section === 'entity' &&
        !['VERTEX', 'SEQEND'].includes(object.type))
    )
      entities.push({ ...common, type: 'polyline', points: [], closed: false });
  }
  const result = {
    ...drawingStyleState(database, layerStateWithNative(database, state)),
    entities: entities.length ? [...state.entities, ...entities] : state.entities,
  };
  cache.source = state;
  cache.value = result;
  return result;
}

export function commitNativePropertyState(
  variables: SystemVariables,
  label: string,
  source: LegacyCadState,
  next: LegacyCadState,
  commit: (label: string, state: LegacyCadState) => void,
): void {
  const database = variables.database,
    ids = nativePropertyIds(database, source);
  const original = nativePropertyState(database, source),
    before = new Map(original.entities.map((e) => [e.id, e]));
  const handles = new Map([...ids].map(([handle, id]) => [id, handle]));
  const edits: NativeGeometryEdit[] = [],
    objects = database.all();
  for (const entity of next.entities) {
    const handle = handles.get(entity.id),
      old = before.get(entity.id);
    if (!handle || !old || JSON.stringify(old) === JSON.stringify(entity)) continue;
    const object = database.get(handle);
    if (!object) throw new Error('Native object no longer exists.');
    const fields: JsonObject = {};
    for (const [key, field] of [
      ['layer', 'layer'],
      ['aci', 'color'],
      ['trueColor', 'trueColor'],
      ['linetype', 'linetype'],
      ['lineweight', 'lineweight'],
      ['linetypeScale', 'linetypeScale'],
      ['thickness', 'thickness'],
      ['material', 'material'],
      ['plotStyle', 'plotStyle'],
    ] as const)
      if (old[key] !== entity[key]) fields[field] = entity[key] ?? null;
    if (old.transparency !== entity.transparency)
      fields.transparency =
        entity.transparency === 'bylayer'
          ? 0
          : entity.transparency === 'byblock'
            ? 0x01000000
            : 0x02000000 | Math.round(255 * (1 - Number(entity.transparency) / 100));
    if (old.type === 'line' && entity.type === 'line') {
      if (JSON.stringify(old.a) !== JSON.stringify(entity.a)) fields.start = wcs(entity.a);
      if (JSON.stringify(old.b) !== JSON.stringify(entity.b)) fields.end = wcs(entity.b);
    } else if (old.type === 'circle' && entity.type === 'circle') {
      if (JSON.stringify(old.center) !== JSON.stringify(entity.center))
        fields.center = wcs(entity.center);
      if (old.radius !== entity.radius) fields.radius = entity.radius;
    }
    const geometry = nativeGeometryEdits(object, objects, old, entity),
      root = geometry.find((edit) => edit.handle === handle);
    Object.assign(fields, root?.fields);
    if (old.type === 'line' || old.type === 'circle' || old.curve) {
      const parsed = geometryFromFields(
        object.type,
        nativeEditedFields(nativeGeometryFields(object, objects), {
          ...fields,
          ...root?.cacheFields,
        }),
      );
      if (
        parsed.status !== 'ok' ||
        (parsed.geometry.type === 'LINE' &&
          magnitude3(subtract3(parsed.geometry.end, parsed.geometry.start)) < 1e-12)
      )
        throw new Error('The edited native geometry is invalid.');
    }
    if (Object.keys(fields).length || root?.cacheFields)
      edits.push({
        handle,
        fields,
        ...(root?.cacheFields ? { cacheFields: root.cacheFields } : {}),
      });
    edits.push(...geometry.filter((edit) => edit.handle !== handle));
  }
  for (const edit of edits) {
    const object = database.get(edit.handle)!;
    const mapped = new Set(getDxfObjectSchema(object.type)?.fields.map((field) => field.name));
    if (Object.keys(edit.fields).some((name) => !mapped.has(name)))
      throw new Error('This native property does not have an editable DXF mapping.');
  }
  variables.atomic(label, () => {
    database.transaction(label, (tx) => {
      for (const edit of edits)
        tx.modify(edit.handle, (object) => {
          const mapped = new Set(getDxfObjectSchema(object.type)?.fields.map((f) => f.name));
          const patch = Object.fromEntries(
            Object.entries(edit.fields).filter(([name]) => mapped.has(name)),
          );
          if (Object.keys(patch).length) Object.assign(object, applyDxfFieldPatch(object, patch));
          for (const [key, value] of Object.entries(edit.fields)) {
            if (value === null) delete object.fields[key];
            else object.fields[key] = value;
          }
          if (edit.cacheFields) Object.assign(object.fields, structuredClone(edit.cacheFields));
        });
    });
    commit(label, {
      ...next,
      layers: source.layers,
      entities: next.entities.filter((e) => !handles.has(e.id)),
    });
  });
}
