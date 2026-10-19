interface GeometryRecord {
  type: string;
  handle: string;
  owner: string;
  tags: [number, number][];
}
/** Detect external native edits before accepting a previously saved metadata view. */
export function nativeGeometrySignatures(lines: readonly (string | number)[]): Map<string, string> {
  const records: GeometryRecord[] = [];
  let current: GeometryRecord | undefined;
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(lines[i]),
      value = String(lines[i + 1]);
    if (code === 0) {
      if (current?.handle) records.push(current);
      current = { type: value.trim(), handle: '', owner: '', tags: [] };
      continue;
    }
    if (!current) continue;
    if (code === 5) current.handle = value.trim().toUpperCase();
    if (code === 330) current.owner = value.trim().toUpperCase();
    if (
      (code >= 10 && code <= 59 && code !== 48) ||
      (code >= 70 && code <= 99) ||
      (code >= 210 && code <= 239) ||
      (code >= 280 && code <= 299)
    )
      current.tags.push([code, Number(value)]);
  }
  if (current?.handle) records.push(current);
  const children = new Map<string, GeometryRecord[]>();
  for (const record of records)
    if (record.type === 'VERTEX' || record.type === 'SEQEND') {
      const owned = children.get(record.owner) ?? [];
      owned.push(record);
      children.set(record.owner, owned);
    }
  const body = (record: GeometryRecord): string =>
    JSON.stringify([record.type, record.tags.sort((a, b) => a[0] - b[0])]);
  const digest = (text: string): string => {
    let first = 2166136261,
      second = 3335557771;
    for (let i = 0; i < text.length; i++) {
      first = Math.imul(first ^ text.charCodeAt(i), 16777619);
      second = Math.imul(second ^ text.charCodeAt(text.length - i - 1), 2246822519);
    }
    return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  };
  return new Map(
    records.map((record) => [
      record.handle,
      digest(body(record) + (children.get(record.handle) ?? []).map(body).join('')),
    ]),
  );
}
