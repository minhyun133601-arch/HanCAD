import type { CadPoint } from '@hancad/legacy-bridge';
import { parseDraftAngle, parseDraftNumber } from './coordinate-units';
import type { CoordinateSettings } from './coordinate-units';
export * from './coordinate-units';
export * from './coordinate-format';
export type DraftPoint = CadPoint & { z?: number };
export type CoordinateProvider = () => Partial<CoordinateSettings>;

export function validDraftPoint(point: DraftPoint): boolean {
  return [point.x, point.y, point.z ?? 0].every(
    (value) => Number.isFinite(value) && Math.abs(value) <= 1e12,
  );
}

/** Command-line coordinates are absolute by default; dynamic fields pass relativeDefault. */
export function parseDraftPoint(
  input: string,
  base: DraftPoint = { x: 0, y: 0 },
  settings: Partial<CoordinateSettings> = {},
  relativeDefault = false,
): DraftPoint | undefined {
  const raw = input.trim(),
    prefix = /^[@#]/.test(raw) ? raw[0] : '';
  const value = prefix ? raw.slice(1) : raw;
  const relative = prefix === '@' || (!prefix && relativeDefault);
  const origin = relative ? base : { x: 0, y: 0 };
  const coordinate = value.split(',');
  const angles = (coordinate[0] ?? '').split('<');
  let result: DraftPoint;
  if (angles.length === 2 || angles.length === 3) {
    if (coordinate.length > 2 || (angles.length === 3 && coordinate.length > 1)) return undefined;
    const length = parseDraftNumber(angles[0] ?? '', settings);
    const heading = parseDraftAngle(angles[1] ?? '', settings);
    const elevation =
      angles.length === 3
        ? parseDraftAngle(angles[2] ?? '', { ...settings, angbase: 0, angdir: 0 })
        : 0;
    if (length === undefined || length < 0 || heading === undefined || elevation === undefined)
      return undefined;
    const radius = length * Math.cos(elevation);
    result = { x: origin.x + radius * Math.cos(heading), y: origin.y - radius * Math.sin(heading) };
    if (angles.length === 3 || coordinate.length === 2) {
      const z =
        angles.length === 3
          ? length * Math.sin(elevation)
          : parseDraftNumber(coordinate[1] ?? '', settings);
      if (z === undefined) return undefined;
      result.z = (relative ? (base.z ?? 0) : 0) + z;
    } else if ((relative && base.z !== undefined) || settings.elevation)
      result.z = relative ? (base.z ?? 0) : (settings.elevation ?? 0);
  } else {
    if (angles.length !== 1 || coordinate.length < 2 || coordinate.length > 3) return undefined;
    const values = coordinate.map((part) => parseDraftNumber(part, settings));
    if (values.some((part) => part === undefined)) return undefined;
    result = { x: origin.x + values[0]!, y: origin.y - values[1]! };
    if (coordinate.length === 3) result.z = (relative ? (base.z ?? 0) : 0) + values[2]!;
    else if ((relative && base.z !== undefined) || settings.elevation)
      result.z = relative ? (base.z ?? 0) : (settings.elevation ?? 0);
  }
  return validDraftPoint(result) ? result : undefined;
}
