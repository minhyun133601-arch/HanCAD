import { bulgeArc } from '@hancad/geom';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { gripBulgeThrough } from './grip-geometry';
import { gripTranslate } from './grip-transform';
import type { EntityGrip } from './grip-types';

function arcMiddle(entity: CadPolyline, index: number): CadPoint {
  const a = entity.points[index]!,
    b = entity.points[(index + 1) % entity.points.length]!,
    arc = bulgeArc(a, b, entity.bulges?.[index] ?? 0);
  return {
    x: arc
      ? arc.center.x + arc.radius * Math.cos(arc.startAngle + arc.sweepAngle / 2)
      : (a.x + b.x) / 2,
    y: arc
      ? arc.center.y + arc.radius * Math.sin(arc.startAngle + arc.sweepAngle / 2)
      : (a.y + b.y) / 2,
    ...(a.z === undefined && b.z === undefined ? {} : { z: ((a.z ?? 0) + (b.z ?? 0)) / 2 }),
  };
}

/** REVCLOUDGRIPS=0 exposes the underlying polyline's exact arc vertices and midpoints. */
export function cloudArcGrips(entity: CadPolyline, extra: boolean): EntityGrip[] {
  const result: EntityGrip[] = entity.points.map((point, index) => ({
    entityId: entity.id,
    key: `v${index}`,
    point: { ...point },
    kind: 'vertex',
    actions: ['stretch'],
  }));
  if (extra)
    for (let i = 0; i < entity.points.length - (entity.closed ? 0 : 1); i++)
      result.push({
        entityId: entity.id,
        key: `s${i}`,
        point: arcMiddle(entity, i),
        kind: 'midpoint',
        actions: ['stretch'],
      });
  return result;
}

/** Individual arc edits retain widths and all unaffected scallops without resubdivision. */
export function stretchCloudArcs(
  entity: CadPolyline,
  keys: readonly string[],
  delta: CadPoint,
): CadPolyline {
  const result = structuredClone(entity),
    hot = new Set(keys),
    count = entity.points.length - (entity.closed ? 0 : 1),
    straightMoves = (i: number): boolean =>
      i < count && hot.has(`s${i}`) && !(entity.bulges?.[i] ?? 0);
  result.points = entity.points.map((point, index) =>
    hot.has(`v${index}`) ||
    straightMoves(index) ||
    straightMoves((index - 1 + entity.points.length) % entity.points.length)
      ? gripTranslate(point, delta)
      : { ...point },
  );
  result.bulges = entity.points.map((_, index) => {
    const bulge = entity.bulges?.[index] ?? 0;
    if (!bulge || index >= count || !hot.has(`s${index}`)) return bulge;
    return gripBulgeThrough(
      result.points[index]!,
      gripTranslate(arcMiddle(entity, index), delta),
      result.points[(index + 1) % result.points.length]!,
    );
  });
  if (entity.cloudVertices)
    result.cloudVertices = entity.cloudVertices.map((corner) => {
      const index = entity.points.findIndex(
        (point) =>
          Math.hypot(point.x - corner.x, point.y - corner.y, (point.z ?? 0) - (corner.z ?? 0)) <=
          1e-9,
      );
      return index < 0 ? { ...corner } : { ...result.points[index]! };
    });
  return result;
}
