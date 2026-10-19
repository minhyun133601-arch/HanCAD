import type { DatabaseObject, DrawingDatabase, DxfGroup, JsonValue } from '@hancad/db';
import type { DrawResult } from '@hancad/draft';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { nativeHatchLayer } from './native-hatch-selection';

type Copies = NonNullable<DrawResult['nativeCopies']>;
/** Validate the source graph before any drawing or profile variable is published. */
export function validateNativeCopies(
  database: DrawingDatabase,
  source: LegacyCadState,
  copies: Copies,
): void {
  const model = database.find('BLOCK_RECORD', '*Model_Space')?.handle;
  const handles = new Set<string>();
  for (const copy of copies) {
    const original = database.get(copy.sourceHandle),
      layer = original && nativeHatchLayer(original),
      blocked = source.layers.find((item) => item.name === layer);
    if (
      !original ||
      original.erased ||
      original.fields.visible === false ||
      original.type !== 'HATCH' ||
      original.owner !== model ||
      copy.object.type !== original.type ||
      copy.object.handle !== original.handle ||
      copy.object.owner !== original.owner ||
      copy.object.erased ||
      handles.has(original.handle) ||
      (blocked && (!blocked.visible || blocked.locked))
    )
      throw Error('Invalid native HATCH copy source.');
    handles.add(original.handle);
  }
}
const isHandleCode = (code: number) =>
  code === 5 ||
  code === 105 ||
  (code >= 320 && code <= 369) ||
  code === 390 ||
  code === 480 ||
  code === 481 ||
  code === 1005;
function remapGroups(groups: DxfGroup[], handles: ReadonlyMap<string, string>): DxfGroup[] {
  return groups.map((group) => ({
    ...group,
    value:
      isHandleCode(group.code) && typeof group.value === 'string'
        ? (handles.get(group.value) ?? group.value)
        : group.value,
  }));
}
function remapFields(value: JsonValue, handles: ReadonlyMap<string, string>, key = ''): JsonValue {
  if (typeof value === 'string')
    return /^(handle|owner|material|plotStyle|.*Handle)$/i.test(key)
      ? (handles.get(value) ?? value)
      : value;
  if (Array.isArray(value)) return value.map((v) => remapFields(v, handles, key));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remapFields(v, handles, k)]),
    );
  return value;
}
/** Clone owned extension data with fresh handles, retaining non-owned references and opaque groups. */
export function commitNativeCopies(
  database: DrawingDatabase,
  label: string,
  copies: Copies,
): string[] {
  const ids: string[] = [],
    all = database.all();
  database.transaction(label, (tx) => {
    for (const copy of copies) {
      const original = database.get(copy.sourceHandle)!,
        graph: DatabaseObject[] = [copy.object],
        included = new Set([original.handle]);
      for (let i = 0; i < graph.length; i++)
        for (const child of all)
          if (
            (child.owner === graph[i]!.handle || child.handle === graph[i]!.extensionDictionary) &&
            !included.has(child.handle)
          ) {
            graph.push(child);
            included.add(child.handle);
          }
      const handles = new Map<string, string>();
      for (const object of graph) {
        const { handle, ...input } = object;
        const added = tx.add({ ...input, owner: handles.get(object.owner ?? '') ?? object.owner });
        handles.set(handle, added.handle);
      }
      for (const object of graph) {
        const handle = handles.get(object.handle)!;
        tx.modify(handle, (added) => {
          added.owner = handles.get(object.owner ?? '') ?? object.owner;
          added.extensionDictionary =
            handles.get(object.extensionDictionary ?? '') ?? object.extensionDictionary;
          added.reactors = object.reactors.map((id) => handles.get(id) ?? id);
          added.groups = remapGroups(object.groups, handles);
          added.xdata = Object.fromEntries(
            Object.entries(object.xdata).map(([key, value]) => [key, remapGroups(value, handles)]),
          );
          added.fields = remapFields(object.fields, handles) as DatabaseObject['fields'];
        });
      }
      ids.push(handles.get(original.handle)!);
      if (copy.eraseSource) for (const object of graph) tx.erase(object.handle);
    }
  });
  return ids;
}
