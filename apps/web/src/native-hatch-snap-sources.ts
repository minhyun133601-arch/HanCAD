import type { DatabaseObject, DxfGroup } from '@hancad/db';
import { geometryFromFields, objectAxes, transformGeometry } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';

/** Read boundary geometry directly; raw HATCH pattern/association records remain untouched. */
export function nativeHatchSnapCurves(object: DatabaseObject): CurveGeometry[] {
  const groups = object.groups,
    start = groups.findIndex((group) => group.code === 91);
  if (start < 0) return [];
  const normal = arrayPoint(object.fields.extrusion) ?? point(groups, 210) ?? { x: 0, y: 0, z: 1 },
    axes = objectAxes(normal);
  const elevation =
    typeof object.fields.elevation === 'number' ? object.fields.elevation : numeric(groups, 30, 0);
  const matrix = [
    axes.x.x,
    axes.y.x,
    axes.z.x,
    axes.z.x * elevation,
    axes.x.y,
    axes.y.y,
    axes.z.y,
    axes.z.y * elevation,
    axes.x.z,
    axes.y.z,
    axes.z.z,
    axes.z.z * elevation,
  ] as const;
  const paths: DxfGroup[][] = [];
  for (let i = start + 1; i < groups.length; i++) {
    const group = groups[i]!;
    if (group.code === 75) break;
    if (group.code === 92) paths.push([]);
    paths.at(-1)?.push(group);
  }
  return paths.flatMap((path) => {
    if (numeric(path, 92, 0) & 2) {
      const vertices: { position: [number, number, number]; bulge: number }[] = [];
      for (let index = 0; index < path.length; index++)
        if (path[index]!.code === 10) {
          const next = path.findIndex((group, i) => i > index && group.code === 10),
            slice = path.slice(index, next < 0 ? undefined : next),
            p = point(slice, 10);
          if (p) vertices.push({ position: [p.x, p.y, 0], bulge: numeric(slice, 42, 0) });
        }
      const parsed = geometryFromFields('LWPOLYLINE', { vertices, flags: numeric(path, 73, 0) });
      return parsed.status === 'ok' ? [transformGeometry(parsed.geometry, matrix)] : [];
    }
    const edges: DxfGroup[][] = [];
    for (const group of path) {
      if (group.code === 72) edges.push([]);
      edges.at(-1)?.push(group);
    }
    return edges.flatMap((edge) => {
      const curve = edgeCurve(edge);
      return curve ? [transformGeometry(curve, matrix)] : [];
    });
  });
}
function edgeCurve(groups: readonly DxfGroup[]): CurveGeometry | undefined {
  const type = numeric(groups, 72, 0),
    start = point(groups, 10);
  if (!start) return;
  if (type === 1) {
    const end = point(groups, 11);
    return end ? { type: 'LINE', start, end } : undefined;
  }
  if (type === 2 || type === 3) {
    const from = (numeric(groups, 50, 0) * Math.PI) / 180,
      to = (numeric(groups, 51, 0) * Math.PI) / 180,
      ccw = numeric(groups, 73, 1) !== 0;
    let sweep = (((ccw ? to - from : from - to) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (sweep < 1e-12) sweep = Math.PI * 2;
    if (!ccw) sweep = -sweep;
    if (type === 2) {
      const radius = numeric(groups, 40, 0);
      if (radius <= 0) return;
      return {
        type: 'ARC',
        center: start,
        radius,
        startAngle: from,
        sweepAngle: sweep,
        normal: { x: 0, y: 0, z: 1 },
        xAxis: { x: 1, y: 0, z: 0 },
      };
    }
    const major = point(groups, 11),
      ratio = numeric(groups, 40, 0);
    if (!major || ratio <= 0) return;
    return {
      type: 'ELLIPSE',
      center: start,
      majorAxis: major,
      minorAxis: { x: -major.y * ratio, y: major.x * ratio, z: 0 },
      startParameter: from,
      sweepParameter: sweep,
    };
  }
  if (type === 4) {
    const controls: [number, number, number][] = [],
      weights: number[] = [],
      knots: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      if (group.code === 97) break;
      if (group.code === 10) {
        const p = point(groups.slice(i), 10);
        if (p) controls.push([p.x, p.y, 0]);
      }
      if (group.code === 40 && typeof group.value === 'number') knots.push(group.value);
      if (group.code === 42 && typeof group.value === 'number') weights.push(group.value);
    }
    const parsed = geometryFromFields('SPLINE', {
      degree: numeric(groups, 94, 3),
      knots,
      controlPoints: controls,
      weights,
      flags: numeric(groups, 74, 0) ? 2 : 0,
    });
    return parsed.status === 'ok' ? parsed.geometry : undefined;
  }
  return;
}
function numeric(groups: readonly DxfGroup[], code: number, fallback: number): number {
  const value = groups.find((group) => group.code === code)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function point(groups: readonly DxfGroup[], code: number): Vec3 | undefined {
  const index = groups.findIndex((group) => group.code === code);
  if (index < 0) return;
  const x = groups[index]!.value,
    y = groups.slice(index + 1).find((group) => group.code === code + 10)?.value;
  const z = groups.slice(index + 1).find((group) => group.code === code + 20)?.value;
  return typeof x === 'number' && typeof y === 'number'
    ? { x, y, z: typeof z === 'number' ? z : 0 }
    : undefined;
}
function arrayPoint(value: unknown): Vec3 | undefined {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? { x: value[0], y: value[1], z: typeof value[2] === 'number' ? value[2] : 0 }
    : undefined;
}
