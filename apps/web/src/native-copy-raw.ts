import type { DatabaseObject } from '@hancad/db';
import type { Vec3 } from '@hancad/geom';

function eligible(object: DatabaseObject, classes: readonly string[]): number[] {
  const scoped = object.groups.some((group) => group.code === 100);
  let subclass = '',
    depth = 0,
    xdata = false;
  return object.groups.flatMap((group, index) => {
    if (group.code === 1001) xdata = true;
    if (group.code === 102) {
      if (String(group.value).startsWith('{')) depth++;
      else if (group.value === '}') depth = Math.max(0, depth - 1);
      return [];
    }
    if (!depth && !xdata && group.code === 100) subclass = String(group.value);
    return !depth && !xdata && (!scoped || classes.includes(subclass)) ? [index] : [];
  });
}
export function nativeRawPoint(
  object: DatabaseObject,
  code: number,
  subclass: string,
): number[] | undefined {
  const indices = eligible(object, [subclass]);
  if (!indices.some((index) => object.groups[index]!.code === code)) return undefined;
  return [code, code + 10, code + 20].map((c) =>
    Number(indices.map((i) => object.groups[i]!).find((g) => g.code === c)?.value ?? 0),
  );
}
export function writeNativeRawPoint(
  object: DatabaseObject,
  code: number,
  values: readonly number[],
  subclass: string,
): void {
  if (!object.groups.length) return;
  const remaining = new Map(
    [code, code + 10, code + 20].map((c, index) => [c, values[index] ?? 0]),
  );
  const indices = eligible(object, [subclass]);
  for (const index of indices) {
    const group = object.groups[index]!;
    if (remaining.has(group.code)) {
      group.value = remaining.get(group.code)!;
      remaining.delete(group.code);
    }
  }
  let insertion = (indices.at(-1) ?? -1) + 1;
  if (!insertion) {
    const marker = object.groups.findIndex((g) => g.code === 100 && g.value === subclass);
    if (marker >= 0) insertion = marker + 1;
    else {
      insertion = object.groups.findIndex((g) => g.code >= 1000);
      if (insertion < 0) insertion = object.groups.length;
    }
  }
  object.groups.splice(insertion, 0, ...[...remaining].map(([c, value]) => ({ code: c, value })));
}
/** HELIX keeps inherited spline control/fit points and analytic axis/start points in WCS. */
export function translateNativeHelixRaw(object: DatabaseObject, delta: Vec3): void {
  const codes = new Map([
    [10, delta.x],
    [20, delta.y],
    [30, delta.z],
    [11, delta.x],
    [21, delta.y],
    [31, delta.z],
  ]);
  for (const index of eligible(object, ['AcDbSpline', 'AcDbHelix'])) {
    const group = object.groups[index]!,
      shift = codes.get(group.code);
    if (shift !== undefined && typeof group.value === 'number') group.value += shift;
  }
}
