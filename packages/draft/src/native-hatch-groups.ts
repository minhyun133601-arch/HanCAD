import type { DxfGroup } from '@hancad/db';

export type HatchPoint = { x: number; y: number };
export interface HatchMap {
  point: (point: HatchPoint) => HatchPoint;
  vector: (point: HatchPoint) => HatchPoint;
  angle: (degrees: number) => number;
}
export const hatchNumber = (groups: readonly DxfGroup[], code: number, fallback = 0): number => {
  const value = groups.find((g) => g.code === code)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};
export function hatchSet(groups: DxfGroup[], code: number, value: number): void {
  const group = groups.find((g) => g.code === code);
  if (group) group.value = value;
  else groups.push({ code, value });
}
function pairs(groups: DxfGroup[], x: number, y: number, map: HatchMap['point']): number {
  let count = 0;
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i]!;
    if (a.code !== x) continue;
    const b = groups[i + 1];
    if (typeof a.value !== 'number' || b?.code !== y || typeof b.value !== 'number')
      throw Error('Malformed HATCH coordinate pair.');
    const point = map({ x: a.value, y: b.value });
    a.value = point.x;
    b.value = point.y;
    count++;
  }
  return count;
}
export function hatchBoundaryRanges(groups: readonly DxfGroup[]): { start: number; end: number }[] {
  const start = groups.findIndex((g) => g.code === 91),
    end = groups.findIndex((g, i) => i > start && g.code === 75);
  if (start < 0 || end < 0) throw Error('Missing HATCH boundary data.');
  const starts = groups.flatMap((g, i) => (i > start && i < end && g.code === 92 ? [i] : []));
  if (!starts.length || starts.length !== hatchNumber(groups, 91))
    throw Error('Inconsistent HATCH boundary count.');
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? end }));
}
/** Reflect every documented boundary representation without flattening curves. */
export function mirrorHatchBoundaries(groups: DxfGroup[], map: HatchMap): void {
  for (const range of hatchBoundaryRanges(groups)) {
    const path = groups.slice(range.start, range.end);
    // Association needs boundary-reference remapping, which is deliberately refused by the caller.
    if (hatchNumber(path, 92) & 2) {
      if (pairs(path, 10, 20, map.point) !== hatchNumber(path, 93))
        throw Error('Inconsistent HATCH polyline vertices.');
      for (const g of path) if (g.code === 42 && typeof g.value === 'number') g.value *= -1;
      continue;
    }
    const starts = path.flatMap((g, i) => (g.code === 72 ? [i] : []));
    if (starts.length !== hatchNumber(path, 93)) throw Error('Inconsistent HATCH edge count.');
    for (let i = 0; i < starts.length; i++) {
      const edge = path.slice(starts[i]!, starts[i + 1]),
        type = hatchNumber(edge, 72);
      if (type === 1) {
        if (pairs(edge, 10, 20, map.point) !== 1 || pairs(edge, 11, 21, map.point) !== 1)
          throw Error('Malformed HATCH line.');
      } else if (type === 2 || type === 3) {
        if (pairs(edge, 10, 20, map.point) !== 1 || !(hatchNumber(edge, 40) > 0))
          throw Error('Malformed HATCH arc.');
        if (type === 3 && pairs(edge, 11, 21, map.vector) !== 1)
          throw Error('Malformed HATCH ellipse.');
        for (const code of [50, 51]) {
          const angle = hatchNumber(edge, code, NaN);
          if (!Number.isFinite(angle)) throw Error('Missing HATCH arc angle.');
          hatchSet(edge, code, type === 2 ? map.angle(angle) : ((-angle % 360) + 360) % 360);
        }
        if (!edge.some((g) => g.code === 73)) throw Error('Missing HATCH arc orientation.');
        hatchSet(edge, 73, hatchNumber(edge, 73, 1) ? 0 : 1);
      } else if (type === 4) {
        if (pairs(edge, 10, 20, map.point) !== hatchNumber(edge, 96))
          throw Error('Inconsistent HATCH spline controls.');
        pairs(edge, 11, 21, map.point);
        pairs(edge, 12, 22, map.vector);
        pairs(edge, 13, 23, map.vector);
      } else throw Error(`Unsupported HATCH boundary edge ${type}.`);
    }
  }
}
/** Definition line angles/offsets are already expanded/scaled DXF values. */
export function mirrorHatchPattern(groups: DxfGroup[], map: HatchMap, mirror: boolean): void {
  const boundaryEnd = groups.findIndex((g) => g.code === 75);
  const tail = groups.slice(boundaryEnd);
  const start = tail.findIndex((g) => g.code === 78),
    count = hatchNumber(tail, 78),
    lines = tail.flatMap((g, i) => (i > start && g.code === 53 ? [i] : []));
  if (lines.length !== count) throw Error('Inconsistent HATCH pattern definition.');
  if (mirror) {
    const angle = groups.find((g, i) => i > boundaryEnd && g.code === 52);
    if (angle && typeof angle.value === 'number') angle.value = map.angle(angle.value);
  }
  for (let i = 0; i < lines.length; i++) {
    const line = tail.slice(lines[i]!, lines[i + 1]),
      angle = line[0]!;
    if (typeof angle.value !== 'number' || pairs(line, 43, 44, map.point) !== 1)
      throw Error('Malformed HATCH pattern line.');
    if (mirror) {
      angle.value = map.angle(angle.value);
      if (pairs(line, 45, 46, map.vector) !== 1) throw Error('Missing HATCH pattern offset.');
    }
    if (line.filter((g) => g.code === 49).length !== hatchNumber(line, 79))
      throw Error('Inconsistent HATCH dash definition.');
  }
  // Seed points use their own count and repeat 10/20 after the definition data.
  const seed = tail.findIndex((g) => g.code === 98);
  if (seed >= 0 && pairs(tail.slice(seed + 1), 10, 20, map.point) !== hatchNumber(tail, 98))
    throw Error('Inconsistent HATCH seed count.');
}
