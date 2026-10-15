import { normalizeHandle } from './types';
import type { DatabaseObject, DatabaseSnapshot, Handle, JsonValue } from './types';

function assertGroups(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('Invalid DXF group list.');
  for (const group of value) {
    if (
      typeof group !== 'object' ||
      group === null ||
      !('code' in group) ||
      !Number.isSafeInteger(group.code) ||
      !('value' in group)
    )
      throw new Error('Invalid DXF group.');
    assertJson(group.value);
  }
}

export function assertJson(value: unknown): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item);
    return;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const item of Object.values(value)) assertJson(item);
    return;
  }
  throw new Error('Database fields must contain finite JSON data.');
}

export function assertObject(value: unknown): asserts value is DatabaseObject {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid database object.');
  const object = value as Record<string, unknown>;
  if (
    typeof object.handle !== 'string' ||
    normalizeHandle(object.handle) !== object.handle ||
    typeof object.type !== 'string' ||
    !object.type
  )
    throw new Error('Invalid object handle or type.');
  if (
    object.owner !== null &&
    (typeof object.owner !== 'string' || normalizeHandle(object.owner) !== object.owner)
  )
    throw new Error('Invalid object owner.');
  if (
    typeof object.erased !== 'boolean' ||
    !Array.isArray(object.reactors) ||
    !Array.isArray(object.groups)
  )
    throw new Error('Invalid object metadata.');
  for (const handle of object.reactors)
    if (typeof handle !== 'string' || normalizeHandle(handle) !== handle)
      throw new Error('Invalid reactor handle.');
  if (
    object.extensionDictionary !== null &&
    (typeof object.extensionDictionary !== 'string' ||
      normalizeHandle(object.extensionDictionary) !== object.extensionDictionary)
  )
    throw new Error('Invalid extension dictionary handle.');
  for (const key of ['xdata', 'fields'])
    if (typeof object[key] !== 'object' || object[key] === null || Array.isArray(object[key]))
      throw new Error(`Invalid object ${key}.`);
  assertGroups(object.groups);
  for (const groups of Object.values(object.xdata as Record<string, unknown>)) assertGroups(groups);
  assertJson(value);
}

export function assertSnapshot(value: unknown): asserts value is DatabaseSnapshot {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid HanCAD database.');
  const object = value as Record<string, unknown>;
  if (
    object.format !== 'HanCAD.Database' ||
    object.version !== 1 ||
    !Array.isArray(object.objects) ||
    typeof object.handseed !== 'string'
  )
    throw new Error('Unsupported HanCAD database format.');
  for (const entity of object.objects) assertObject(entity);
  if (
    typeof object.tables !== 'object' ||
    object.tables === null ||
    typeof object.namedObjectDictionary !== 'string'
  )
    throw new Error('Invalid database dictionaries.');
  for (const name of ['drawingVariables', 'metadata'])
    if (typeof object[name] !== 'object' || object[name] === null || Array.isArray(object[name]))
      throw new Error(`Invalid ${name}.`);
  assertJson(value);
}

export function validateSnapshot(snapshot: DatabaseSnapshot): void {
  assertSnapshot(snapshot);
  const handles = new Set<Handle>();
  const seed = BigInt(`0x${normalizeHandle(snapshot.handseed)}`);
  for (const object of snapshot.objects) {
    if (handles.has(object.handle)) throw new Error(`Duplicate handle: ${object.handle}`);
    if (BigInt(`0x${object.handle}`) >= seed)
      throw new Error('$HANDSEED must exceed every object handle.');
    handles.add(object.handle);
  }
  for (const object of snapshot.objects)
    if (object.owner !== null && !handles.has(object.owner))
      throw new Error(`Unknown owner: ${object.owner}`);
  for (const name of [
    'BLOCK_RECORD',
    'LAYER',
    'LTYPE',
    'STYLE',
    'DIMSTYLE',
    'UCS',
    'VIEW',
    'VPORT',
    'APPID',
  ] as const) {
    const handle = snapshot.tables[name];
    if (typeof handle !== 'string' || !handles.has(handle))
      throw new Error(`Missing symbol table: ${name}`);
    const table = snapshot.objects.find((object) => object.handle === handle);
    if (table?.type !== 'SYMBOL_TABLE' || table.name !== name)
      throw new Error(`Invalid symbol table: ${name}`);
  }
  if (!handles.has(snapshot.namedObjectDictionary))
    throw new Error('Missing named object dictionary.');
  const byHandle = new Map(snapshot.objects.map((object) => [object.handle, object]));
  if (byHandle.get(snapshot.namedObjectDictionary)?.type !== 'DICTIONARY')
    throw new Error('Invalid named object dictionary.');
  for (const object of snapshot.objects) {
    const visited = new Set<Handle>([object.handle]);
    let owner = object.owner;
    while (owner !== null) {
      if (visited.has(owner)) throw new Error('Circular object ownership.');
      visited.add(owner);
      owner = byHandle.get(owner)!.owner;
    }
    if (object.type === 'DICTIONARY' && object.fields.entries !== undefined) {
      if (!Array.isArray(object.fields.entries)) throw new Error('Invalid dictionary entries.');
      const names = new Set<string>();
      for (const entry of object.fields.entries) {
        if (
          entry === null ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          typeof entry.name !== 'string' ||
          typeof entry.handle !== 'string' ||
          !handles.has(entry.handle) ||
          names.has(entry.name)
        )
          throw new Error('Invalid dictionary entry reference.');
        names.add(entry.name);
        if (entry.hardOwner === true && byHandle.get(entry.handle)?.owner !== object.handle)
          throw new Error('Dictionary hard ownership does not match object owner.');
      }
    }
    if (object.type === 'LAYOUT' && object.fields.blockRecord !== undefined) {
      const block =
        typeof object.fields.blockRecord === 'string'
          ? byHandle.get(object.fields.blockRecord)
          : undefined;
      if (block?.type !== 'BLOCK_RECORD') throw new Error('Invalid layout block record.');
      if (block.fields.layout !== undefined && block.fields.layout !== object.handle)
        throw new Error('Layout and block record references disagree.');
    }
    if (object.type === 'BLOCK_RECORD' && object.fields.layout !== undefined) {
      const layout =
        typeof object.fields.layout === 'string' ? byHandle.get(object.fields.layout) : undefined;
      if (layout?.type !== 'LAYOUT' || layout.fields.blockRecord !== object.handle)
        throw new Error('Invalid block record layout.');
    }
  }
}
