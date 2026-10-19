import type { DrawingDatabase, DatabaseObject } from '@hancad/db';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { closestGeometryPoint, evaluateGeometry } from '@hancad/geom';
import { nativeHatchSnapCurves } from './native-hatch-snap-sources';
import { nativeObjectSelectionId } from '@hancad/draft';

const drawingIdentities = new WeakMap<
  DrawingDatabase,
  { ids: Map<string, string>; reserved: Set<string> }
>();
/** IDs never shrink back or become reusable when a legacy object is erased or undone. */
export function nativeHatchEditorIds(
  database: DrawingDatabase,
  state?: LegacyCadState,
): ReadonlyMap<string, string> {
  let drawing = drawingIdentities.get(database);
  if (!drawing) {
    drawing = { ids: new Map(), reserved: new Set() };
    drawingIdentities.set(database, drawing);
  }
  for (const entity of state?.entities ?? []) drawing.reserved.add(entity.id);
  const model = database.find('BLOCK_RECORD', '*Model_Space')?.handle;
  for (const object of database.all()) {
    if (object.type !== 'HATCH' || object.owner !== model || drawing.ids.has(object.handle))
      continue;
    const id = nativeObjectSelectionId(object.handle, drawing.reserved);
    drawing.ids.set(object.handle, id);
    drawing.reserved.add(id);
  }
  return drawing.ids;
}

/** Presence is independent of layer editability, just like legacy Previous selection. */
export function nativeHatchIdentities(database: DrawingDatabase, state?: LegacyCadState): string[] {
  const model = database.find('BLOCK_RECORD', '*Model_Space')?.handle,
    ids = nativeHatchEditorIds(database, state);
  return database
    .all()
    .filter((object) => object.type === 'HATCH' && object.owner === model)
    .map((object) => ids.get(object.handle)!);
}
export function nativeMirrorContext(database: DrawingDatabase, state: LegacyCadState) {
  return {
    nativeObjects: mirrorNativeObjects(database, state),
    nativeSelectionIds: nativeHatchEditorIds(database, state),
  };
}
export function nativeMirrorSelectionState(
  database: DrawingDatabase,
  state: LegacyCadState,
): LegacyCadState {
  const context = nativeMirrorContext(database, state);
  return nativeHatchSelectionState(state, context.nativeObjects, context.nativeSelectionIds);
}

/** Only top-level model-space hatches are native MIRROR targets in Phase 7. */
export function mirrorNativeObjects(
  database: DrawingDatabase,
  state: LegacyCadState,
): DatabaseObject[] {
  const model = database.find('BLOCK_RECORD', '*Model_Space')?.handle;
  return database.all().filter((object) => {
    if (
      object.type !== 'HATCH' ||
      object.owner !== model ||
      object.fields.visible === false ||
      object.groups.some((g) => g.code === 60 && g.value === 1)
    )
      return false;
    const layerName = nativeHatchLayer(object),
      layer = state.layers.find((item) => item.name === layerName),
      nativeLayer = database.find('LAYER', layerName),
      fields = nativeLayer?.fields;
    return layer
      ? layer.visible && !layer.locked
      : fields?.visible !== false &&
          !(Number(fields?.flags ?? 0) & 5) &&
          Number(fields?.color ?? 7) >= 0;
  });
}
export function nativeHatchLayer(object: DatabaseObject): string {
  const raw = object.groups.find((g) => g.code === 8)?.value;
  return typeof object.fields.layer === 'string'
    ? object.fields.layer
    : typeof raw === 'string'
      ? raw
      : '0';
}
/** These are inquiry adapters, never persisted or passed to a legacy edit factory. */
export function nativeHatchSelectionState(
  state: LegacyCadState,
  objects: readonly DatabaseObject[],
  ids?: ReadonlyMap<string, string>,
): LegacyCadState {
  const reserved = new Set(state.entities.map((entity) => entity.id));
  const adapters: CadEntity[] = objects.map((object) => ({
    id: ids?.get(object.handle) ?? nativeObjectSelectionId(object.handle, reserved),
    type: 'polyline',
    layer: nativeHatchLayer(object),
    color: '#ffffff',
    lineWidth: 1,
    points: [],
    closed: false,
    regionLoops: [nativeHatchSnapCurves(object)],
    sourceType: 'HATCH',
  }));
  const missing = [...new Set(adapters.map((a) => a.layer))].filter(
    (name) => !state.layers.some((l) => l.name === name),
  );
  return {
    ...state,
    entities: [...state.entities, ...adapters],
    layers: [
      ...state.layers,
      ...missing.map((name) => ({ ...state.layers[0]!, name, visible: true, locked: false })),
    ],
  };
}
/** Native pattern rendering is deferred; known boundary coordinates remain pickable in MIRROR. */
export function pickNativeHatch(
  objects: readonly DatabaseObject[],
  point: { x: number; y: number },
  tolerance: number,
  reserved: ReadonlySet<string> = new Set(),
  ids?: ReadonlyMap<string, string>,
): string | undefined {
  for (const object of [...objects].reverse())
    for (const curve of nativeHatchSnapCurves(object)) {
      const first = evaluateGeometry(curve, 0),
        hit = closestGeometryPoint(curve, { x: point.x, y: -point.y, z: first.z }).point;
      if (Math.hypot(hit.x - point.x, hit.y + point.y) <= tolerance)
        return ids?.get(object.handle) ?? nativeObjectSelectionId(object.handle, reserved);
    }
  return undefined;
}
