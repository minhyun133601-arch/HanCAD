import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { distance, wcs } from './draw-curve-helpers';
import {
  arcAt,
  chamferSolution,
  filletSolution,
  support,
  supportIntersections,
  type CornerSolution,
} from './modify-corner-math';
import { bulgeSupport } from './modify-offset-polyline';
import { remapPolylineWidths } from './modify-polyline-widths';
import { polylineElevation } from './modify-polyline-elevation';

export interface CornerSettings {
  fillet: boolean;
  radius: number;
  distance1: number;
  distance2: number;
  angle?: number;
}
function removeExistingFillets(entity: CadPolyline): CadPolyline {
  const points = entity.points.map((p) => ({ ...p })),
    bulges = points.map((_, i) => entity.bulges?.[i] ?? 0);
  for (let pass = 0; pass < entity.points.length; pass++) {
    let changed = false;
    for (
      let i = entity.closed ? 0 : 1;
      i < (entity.closed ? points.length : points.length - 2);
      i++
    ) {
      const count = points.length,
        prev = (i - 1 + count) % count,
        next = (i + 1) % count;
      if (
        Math.abs(bulges[i] ?? 0) < 1e-10 ||
        Math.abs(bulges[prev] ?? 0) > 1e-10 ||
        Math.abs(bulges[next] ?? 0) > 1e-10
      )
        continue;
      const current = { ...entity, points, bulges },
        a = support(cornerPolylineSegment(current, prev)),
        b = support(cornerPolylineSegment(current, next));
      if (!a || !b) continue;
      const intersection = supportIntersections(a, b)[0];
      if (!intersection) continue;
      points[i] = intersection;
      bulges[i] = 0;
      points.splice(next, 1);
      bulges.splice(next, 1);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return { ...entity, points, bulges };
}
export function cornerPolylineSegment(entity: CadPolyline, index: number): CadEntity {
  const elevation = polylineElevation(entity),
    at = (i: number): CadPoint => ({
      ...entity.points[i]!,
      ...(elevation === undefined ? {} : { z: elevation }),
    }),
    a = at(index),
    b = at((index + 1) % entity.points.length),
    bulge = entity.bulges?.[index] ?? 0,
    s = bulgeSupport(a, b, bulge);
  return s.kind === 'line'
    ? { ...entity, type: 'line', a, b, curve: { type: 'LINE', start: wcs(a), end: wcs(b) } }
    : arcAt(entity, s.center, s.radius, a, b, Math.sign(bulge));
}
function parameter(entity: CadPolyline, index: number, p: CadPoint): number {
  const a = entity.points[index]!,
    b = entity.points[(index + 1) % entity.points.length]!,
    bulge = entity.bulges?.[index] ?? 0,
    s = bulgeSupport(a, b, bulge);
  if (s.kind === 'line') {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    return ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  }
  const start = Math.atan2(a.y - s.center.y, a.x - s.center.x),
    end = Math.atan2(p.y - s.center.y, p.x - s.center.x),
    sweep = 4 * Math.atan(bulge),
    tau = 2 * Math.PI;
  return (((((end - start) * Math.sign(bulge)) % tau) + tau) % tau) / Math.abs(sweep);
}
export function polylineCornerSolutions(
  entity: CadPolyline,
  settings: CornerSettings,
): Map<number, CornerSolution> {
  const count = entity.points.length,
    corners = new Map<number, CornerSolution>();
  for (let i = entity.closed ? 0 : 1; i < (entity.closed ? count : count - 1); i++) {
    const prev = (i - 1 + count) % count,
      next = i,
      first = cornerPolylineSegment(entity, prev),
      second = cornerPolylineSegment(entity, next);
    const pickA = entity.points[prev]!,
      pickB = entity.points[(i + 1) % count]!;
    const solution = settings.fillet
      ? filletSolution(first, second, pickA, pickB, settings.radius)
      : chamferSolution(
          first,
          second,
          pickA,
          pickB,
          settings.distance1,
          settings.distance2,
          settings.angle,
        );
    if (
      solution &&
      parameter(entity, prev, solution.first) >= -1e-7 &&
      parameter(entity, prev, solution.first) <= 1 + 1e-7 &&
      parameter(entity, next, solution.second) >= -1e-7 &&
      parameter(entity, next, solution.second) <= 1 + 1e-7
    )
      corners.set(i, solution);
  }
  return corners;
}
export function polylineCorners(entity: CadPolyline, settings: CornerSettings): CadPolyline {
  const original = entity;
  if (settings.fillet) entity = removeExistingFillets(entity);
  const count = entity.points.length,
    segmentCount = entity.closed ? count : count - 1,
    corners = polylineCornerSolutions(entity, settings);
  const points: CadPoint[] = [],
    bulges: number[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const next = (i + 1) % count,
      a = corners.get(i)?.second ?? entity.points[i]!,
      b = corners.get(next)?.first ?? entity.points[next]!,
      originalBulge = entity.bulges?.[i] ?? 0,
      s = bulgeSupport(entity.points[i]!, entity.points[next]!, originalBulge);
    if (parameter(entity, i, a) > parameter(entity, i, b) + 1e-7)
      throw new Error('Fillet radius is too large.');
    let bulge = 0;
    if (s.kind === 'circle') {
      const start = Math.atan2(a.y - s.center.y, a.x - s.center.x),
        end = Math.atan2(b.y - s.center.y, b.x - s.center.x),
        tau = 2 * Math.PI;
      let sweep = (((end - start) % tau) + tau) % tau;
      if (originalBulge < 0) sweep -= tau;
      bulge = Math.tan(sweep / 4);
    }
    points.push(a);
    bulges.push(bulge);
    const corner = corners.get(next);
    if (corner?.connector) {
      const arc = corner.connector;
      points.push(b);
      bulges.push(arc.type === 'arc' ? Math.tan((arc.endAngle - arc.startAngle) / 4) : 0);
    } else if (!entity.closed && i === segmentCount - 1) {
      points.push(b);
      bulges.push(0);
    }
  }
  if (
    points.length < 2 ||
    points.some(
      (p, i) =>
        distance(p, points[(i + 1) % points.length]!) < 1e-12 &&
        (entity.closed || i < points.length - 1),
    )
  )
    throw new Error('Invalid corner result.');
  return remapPolylineWidths(original, {
    ...entity,
    type: 'polyline',
    points,
    bulges,
    sourceType: 'LWPOLYLINE',
    curve: {
      type: 'LWPOLYLINE',
      vertices: points.map((p, i) => ({
        position: wcs(p),
        bulge: -bulges[i]!,
        startWidth: entity.constantWidth ?? 0,
        endWidth: entity.constantWidth ?? 0,
      })),
      closed: entity.closed,
      is3D: false,
      normal: { x: 0, y: 0, z: 1 },
      constantWidth: entity.constantWidth ?? 0,
    },
  });
}
