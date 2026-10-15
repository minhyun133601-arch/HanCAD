import { insertInSubclass, scopedIndices } from './dxf-codec-context';
import type { DxfFieldSchema } from './dxf-schema';
import type { DxfGroup, JsonObject, JsonValue } from './types';
import { assertDxfScalar } from './dxf-value-types';

const vertexNames: Readonly<Record<number, string>> = {
  40: 'startWidth',
  41: 'endWidth',
  42: 'bulge',
  91: 'id',
};

export function decodeRepeated(
  groups: readonly DxfGroup[],
  field: DxfFieldSchema,
): JsonValue | undefined {
  const selected = scopedIndices(groups, field).map((index) => groups[index]!);
  if (!selected.length) return undefined;
  if (field.kind === 'values') return selected.map((group) => structuredClone(group.value));
  if (field.kind === 'points3') {
    const points: JsonValue[][] = [];
    for (const group of selected) {
      if (group.code === field.codes[0]) points.push([group.value, 0, 0]);
      else if (points.length) points.at(-1)![field.codes.indexOf(group.code)] = group.value;
    }
    return points;
  }
  if (field.kind === 'entries') {
    const entries: JsonObject[] = [];
    for (const group of selected) {
      if (group.code === 3) entries.push({ name: group.value });
      else if (entries.length)
        Object.assign(entries.at(-1)!, { handle: group.value, hardOwner: group.code === 360 });
    }
    return entries;
  }
  const vertices: JsonObject[] = [];
  for (const group of selected) {
    if (group.code === 10) vertices.push({ position: [group.value, 0] });
    else if (vertices.length) {
      const vertex = vertices.at(-1)!;
      if (group.code === 20 && Array.isArray(vertex.position)) vertex.position[1] = group.value;
      else if (vertexNames[group.code]) vertex[vertexNames[group.code]!] = group.value;
    }
  }
  return vertices;
}

/** Optional per-vertex codes must follow their own anchor, rather than matching by global code count. */
export function replaceRepeatedRecords(
  groups: readonly DxfGroup[],
  field: DxfFieldSchema,
  encoded: readonly DxfGroup[],
): DxfGroup[] {
  const indices = scopedIndices(groups, field);
  const anchor = field.codes[0]!;
  const starts = indices.filter((index) => groups[index]!.code === anchor);
  if (!starts.length) return insertInSubclass(structuredClone([...groups]), field, encoded);
  const replacements = new Map<number, DxfGroup | undefined>();
  const additions = new Map<number, DxfGroup[]>();
  const records: DxfGroup[][] = [];
  for (const group of encoded) {
    if (group.code === anchor) records.push([]);
    records.at(-1)?.push(group);
  }
  const last = indices.at(-1)!;
  starts.forEach((start, ordinal) => {
    const end = starts[ordinal + 1] ?? last + 1;
    const recordIndices = indices.filter((index) => index >= start && index < end);
    const record = [...(records[ordinal] ?? [])];
    for (const index of recordIndices) {
      const next = record.findIndex((group) => group.code === groups[index]!.code);
      replacements.set(index, next < 0 ? undefined : record.splice(next, 1)[0]);
    }
    if (record.length) additions.set(recordIndices.at(-1)!, record);
  });
  const result = groups.flatMap((group, index) => [
    ...(replacements.has(index)
      ? replacements.get(index)
        ? [structuredClone(replacements.get(index)!)]
        : []
      : [structuredClone(group)]),
    ...structuredClone(additions.get(index) ?? []),
    ...(index === last ? structuredClone(records.slice(starts.length).flat()) : []),
  ]);
  return result;
}

export function encodeRepeated(value: JsonValue, field: DxfFieldSchema): DxfGroup[] {
  if (!Array.isArray(value)) throw new Error(`DXF field ${field.name} requires an array.`);
  if (field.kind === 'values')
    return value.map((entry) => {
      assertDxfScalar(field.codes[0]!, entry);
      return { code: field.codes[0]!, value: entry };
    });
  if (field.kind === 'points3')
    return value.flatMap((point) => {
      if (
        !Array.isArray(point) ||
        point.length !== 3 ||
        point.some((component) => typeof component !== 'number' || !Number.isFinite(component))
      )
        throw new Error(`Invalid DXF point in ${field.name}.`);
      return field.codes.map((code, index) => ({ code, value: point[index]! }));
    });
  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Invalid DXF record in ${field.name}.`);
    if (field.kind === 'entries') {
      if (typeof entry.name !== 'string' || typeof entry.handle !== 'string')
        throw new Error('Invalid DXF dictionary entry.');
      assertDxfScalar(350, entry.handle);
      return [
        { code: 3, value: entry.name },
        { code: entry.hardOwner === true ? 360 : 350, value: entry.handle },
      ];
    }
    const position = entry.position;
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      position.some((component) => typeof component !== 'number' || !Number.isFinite(component))
    )
      throw new Error('Invalid DXF polyline vertex.');
    const result: DxfGroup[] = [
      { code: 10, value: position[0]! },
      { code: 20, value: position[1]! },
    ];
    for (const [code, name] of Object.entries(vertexNames))
      if (entry[name] !== undefined) {
        if (typeof entry[name] !== 'number' || !Number.isFinite(entry[name]))
          throw new Error(`Invalid DXF vertex ${name}.`);
        assertDxfScalar(Number(code), entry[name]);
        result.push({ code: Number(code), value: entry[name] });
      }
    return result;
  });
}
