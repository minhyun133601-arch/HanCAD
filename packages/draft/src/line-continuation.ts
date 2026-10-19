import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { geometryEvaluation } from '@hancad/geom';

/** Enter at LINE's first prompt continues the most recently created line, polyline or arc. */
export function lineContinuation(
  entities: readonly CadEntity[],
  tangentFromLine = false,
): { point: CadPoint; tangent?: CadPoint } | undefined {
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index];
    if (entity?.curve) {
      const curve = entity.curve;
      if (
        curve.type !== 'LINE' &&
        curve.type !== 'ARC' &&
        curve.type !== 'LWPOLYLINE' &&
        curve.type !== 'POLYLINE'
      )
        continue;
      const evaluated = geometryEvaluation(curve, 1);
      const lastBulge =
        curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE'
          ? (curve.vertices.at(curve.closed ? -1 : -2)?.bulge ?? 0)
          : 0;
      return {
        point: {
          x: evaluated.point.x,
          y: -evaluated.point.y,
          ...(evaluated.point.z ? { z: evaluated.point.z } : {}),
        },
        ...(tangentFromLine || curve.type === 'ARC' || lastBulge
          ? { tangent: { x: evaluated.derivative.x, y: -evaluated.derivative.y } }
          : {}),
      };
    }
    if (entity?.type === 'line')
      return {
        point: { ...entity.b },
        ...(tangentFromLine
          ? { tangent: { x: entity.b.x - entity.a.x, y: entity.b.y - entity.a.y } }
          : {}),
      };
    if (entity?.type === 'polyline' || entity?.type === 'rect') {
      if (entity.sourceType && !['LWPOLYLINE', 'POLYLINE', '3DPOLY'].includes(entity.sourceType))
        continue;
      const point = entity.closed ? entity.points[0] : entity.points.at(-1);
      const before = entity.closed ? entity.points.at(-1) : entity.points.at(-2);
      const bulge =
        entity.bulges?.[entity.closed ? entity.points.length - 1 : entity.points.length - 2] ?? 0;
      if (point) {
        const angle = before
          ? Math.atan2(point.y - before.y, point.x - before.x) + 2 * Math.atan(bulge)
          : 0;
        return {
          point: { ...point },
          ...(before && (tangentFromLine || bulge)
            ? { tangent: { x: Math.cos(angle), y: Math.sin(angle) } }
            : {}),
        };
      }
    }
    if (entity?.type === 'arc') {
      const angle = entity.endAngle,
        direction = entity.clockwise ? 1 : -1;
      return {
        point: {
          x: entity.center.x + entity.radius * Math.cos(angle),
          y: entity.center.y + entity.radius * Math.sin(angle),
          ...(entity.center.z === undefined ? {} : { z: entity.center.z }),
        },
        tangent: { x: -Math.sin(angle) * direction, y: Math.cos(angle) * direction },
      };
    }
  }
  return undefined;
}
