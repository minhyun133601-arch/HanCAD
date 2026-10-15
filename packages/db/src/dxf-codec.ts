import { getDxfObjectSchema } from './dxf-schema';
import type { DxfFieldSchema } from './dxf-schema';
import { decodeRepeated, encodeRepeated, replaceRepeatedRecords } from './dxf-codec-repeated';
import {
  dxfGroupContexts,
  insertInSubclass,
  replaceMappedGroups,
  scopedIndices,
} from './dxf-codec-context';
import { assertJson } from './validation';
import { assertDxfScalar } from './dxf-value-types';
import type { DatabaseObject, DxfGroup, JsonObject, JsonValue } from './types';

function decodeField(groups: readonly DxfGroup[], field: DxfFieldSchema): JsonValue | undefined {
  if (['values', 'points3', 'vertices', 'entries'].includes(field.kind))
    return (
      decodeRepeated(groups, field) ??
      (field.default === undefined ? undefined : structuredClone(field.default))
    );
  const selected = scopedIndices(groups, field).map((index) => groups[index]!);
  if (!selected.length)
    return field.default === undefined ? undefined : structuredClone(field.default);
  if (field.kind === 'point2' || field.kind === 'point3')
    return field.codes.map(
      (code, index) =>
        [...selected].reverse().find((group) => group.code === code)?.value ??
        (Array.isArray(field.default) ? field.default[index] : 0) ??
        0,
    );
  const value = selected.at(-1)!.value;
  return field.kind === 'visible' ? value === 0 : structuredClone(value);
}

/** Raw groups remain authoritative for unimplemented fields and duplicate/vendor data. */
export function decodeDxfFields(type: string, groups: readonly DxfGroup[]): JsonObject {
  const fields: JsonObject = {};
  for (const field of getDxfObjectSchema(type)?.fields ?? []) {
    const value = decodeField(groups, field);
    if (value !== undefined) fields[field.name] = value;
  }
  return fields;
}

function encodeField(value: JsonValue, field: DxfFieldSchema): DxfGroup[] {
  assertJson(value);
  if (value === null) return [];
  if (['values', 'points3', 'vertices', 'entries'].includes(field.kind))
    return encodeRepeated(value, field);
  if (field.kind === 'point2' || field.kind === 'point3') {
    if (
      !Array.isArray(value) ||
      value.length !== field.codes.length ||
      value.some((component) => typeof component !== 'number' || !Number.isFinite(component))
    )
      throw new Error(`Invalid DXF point for ${field.name}.`);
    return field.codes.map((code, index) => ({ code, value: value[index]! }));
  }
  if (field.kind === 'visible') {
    if (typeof value !== 'boolean') throw new Error('DXF visibility requires a boolean.');
    return [{ code: field.codes[0]!, value: value ? 0 : 1 }];
  }
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean')
    throw new Error(`DXF field ${field.name} requires a scalar.`);
  assertDxfScalar(field.codes[0]!, value);
  return [{ code: field.codes[0]!, value }];
}

/** Explicit field patches update mapped values only; null removes a mapped optional value. */
export function editDxfFields(
  type: string,
  groups: readonly DxfGroup[],
  patch: JsonObject,
): DxfGroup[] {
  const schema = getDxfObjectSchema(type);
  if (!schema) {
    if (Object.keys(patch).length) throw new Error(`DXF field mapping is unavailable for ${type}.`);
    return structuredClone([...groups]);
  }
  let result = structuredClone([...groups]);
  const current = decodeDxfFields(type, groups);
  const changes = { ...patch };
  for (const [source, target] of [
    ['vertices', 'vertexCount'],
    ['knots', 'knotCount'],
    ['controlPoints', 'controlPointCount'],
    ['fitPoints', 'fitPointCount'],
  ] as const) {
    if (
      Array.isArray(patch[source]) &&
      JSON.stringify(patch[source]) !== JSON.stringify(current[source]) &&
      schema.fields.some((field) => field.name === target)
    )
      changes[target] = patch[source].length;
  }
  for (const [name, value] of Object.entries(changes)) {
    const field = schema.fields.find((item) => item.name === name);
    if (!field) throw new Error(`DXF field mapping is unavailable for ${type}.${name}.`);
    if (JSON.stringify(current[name]) === JSON.stringify(value)) continue;
    const encoded = encodeField(value, field);
    if (
      field.kind === 'scalar' ||
      field.kind === 'visible' ||
      field.kind === 'point2' ||
      field.kind === 'point3'
    ) {
      // Effective values are the last code in a subclass. Preserve earlier duplicate codes.
      const indices = scopedIndices(result, field);
      if (value === null) {
        const removed = new Set(indices);
        result = result.filter((_group, index) => !removed.has(index));
        continue;
      }
      const lastByCode = new Map(
        field.codes.map((code) => [
          code,
          [...indices].reverse().find((index) => result[index]!.code === code),
        ]),
      );
      const additions = encoded.filter((group) => lastByCode.get(group.code) === undefined);
      const contexts = dxfGroupContexts(result);
      result = result.flatMap((group, index) => {
        if (!contexts[index]!.eligible || lastByCode.get(group.code) !== index) return [group];
        const replacement = encoded.find((entry) => entry.code === group.code);
        return replacement ? [replacement] : [];
      });
      result = insertInSubclass(result, field, additions);
    } else
      result =
        field.kind === 'values'
          ? replaceMappedGroups(result, field, encoded)
          : replaceRepeatedRecords(result, field, encoded);
  }
  return result;
}

/** Properties, entmod and future I/O can share one pure mapped edit boundary. */
export function applyDxfFieldPatch(object: DatabaseObject, patch: JsonObject): DatabaseObject {
  const groups = editDxfFields(object.type, object.groups, patch);
  const decoded = decodeDxfFields(object.type, groups);
  const fields: JsonObject = { ...decoded, ...structuredClone(object.fields) };
  for (const field of getDxfObjectSchema(object.type)?.fields ?? []) {
    // Keep canonical-only attributes until they acquire raw groups or are explicitly edited.
    if (!(field.name in patch) && !scopedIndices(groups, field).length) continue;
    const value = decoded[field.name];
    if (value === undefined) delete fields[field.name];
    else fields[field.name] = value;
  }
  const result = {
    ...structuredClone(object),
    groups,
    fields,
  };
  if ('name' in patch && typeof patch.name === 'string' && object.name !== undefined)
    result.name = patch.name;
  return result;
}
