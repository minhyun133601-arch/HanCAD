import type { DatabaseObject } from '@hancad/db';
import { objectAxes } from '@hancad/geom';
import type { Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import {
  hatchBoundaryRanges,
  hatchNumber,
  hatchSet,
  mirrorHatchBoundaries,
  mirrorHatchPattern,
} from './native-hatch-groups';

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
function normalOf(object: DatabaseObject): Vec3 {
  const v = object.fields.extrusion;
  return Array.isArray(v) && v.every((n) => typeof n === 'number')
    ? { x: Number(v[0]), y: Number(v[1]), z: Number(v[2]) }
    : {
        x: hatchNumber(object.groups, 210),
        y: hatchNumber(object.groups, 220),
        z: hatchNumber(object.groups, 230, 1),
      };
}
/** Operates on the real native definition, never on a tessellated compatibility outline. */
export function mirrorNativeHatch(
  object: DatabaseObject,
  base: CadPoint,
  end: CadPoint,
  mirrorPattern: boolean,
): DatabaseObject {
  if (object.type !== 'HATCH') throw Error('Expected native HATCH.');
  if (hatchNumber(object.groups, 450) !== 0)
    throw Error('Gradient HATCH mirroring is not supported.');
  const ranges = hatchBoundaryRanges(object.groups);
  if (
    hatchNumber(object.groups, 71) ||
    ranges.some(({ start, end }) => object.groups.slice(start, end).some((g) => g.code === 330))
  )
    throw Error('Associative HATCH mirroring requires boundary-reference remapping.');
  const angle = Math.atan2(-(end.y - base.y), end.x - base.x),
    c = Math.cos(2 * angle),
    s = Math.sin(2 * angle),
    reflect = (p: Vec3): Vec3 => ({ x: c * p.x + s * p.y, y: s * p.x - c * p.y, z: p.z }),
    wcsBase = { x: base.x, y: -base.y, z: 0 },
    reflectedBase = reflect(wcsBase),
    translation = { x: wcsBase.x - reflectedBase.x, y: wcsBase.y - reflectedBase.y, z: 0 },
    oldAxes = objectAxes(normalOf(object)),
    axes = objectAxes(reflect(oldAxes.z)),
    elevation =
      typeof object.fields.elevation === 'number'
        ? object.fields.elevation
        : hatchNumber(object.groups, 30),
    oldOrigin = {
      x: oldAxes.z.x * elevation,
      y: oldAxes.z.y * elevation,
      z: oldAxes.z.z * elevation,
    },
    originR = reflect(oldOrigin),
    origin = { x: originR.x + translation.x, y: originR.y + translation.y, z: originR.z },
    x = reflect(oldAxes.x),
    y = reflect(oldAxes.y),
    a = dot(x, axes.x),
    b = dot(y, axes.x),
    d = dot(x, axes.y),
    e = dot(y, axes.y),
    tx = dot(origin, axes.x),
    ty = dot(origin, axes.y),
    vector = (p: { x: number; y: number }) => ({ x: a * p.x + b * p.y, y: d * p.x + e * p.y }),
    map = {
      vector,
      point: (p: { x: number; y: number }) => {
        const q = vector(p);
        return { x: q.x + tx, y: q.y + ty };
      },
      angle: (degrees: number) => {
        const radians = (degrees * Math.PI) / 180,
          v = vector({ x: Math.cos(radians), y: Math.sin(radians) });
        return ((((Math.atan2(v.y, v.x) * 180) / Math.PI) % 360) + 360) % 360;
      },
    },
    result = structuredClone(object);
  mirrorHatchBoundaries(result.groups, map);
  mirrorHatchPattern(result.groups, map, mirrorPattern);
  const headerEnd = result.groups.findIndex((g) => g.code === 91),
    header = result.groups.slice(0, headerEnd);
  hatchSet(header, 30, dot(origin, axes.z));
  for (const [code, value] of [
    [210, axes.z.x],
    [220, axes.z.y],
    [230, axes.z.z],
  ])
    hatchSet(header, code!, value!);
  result.groups.splice(0, headerEnd, ...header);
  result.fields.extrusion = [axes.z.x, axes.z.y, axes.z.z];
  result.fields.elevation = dot(origin, axes.z);
  return result;
}
