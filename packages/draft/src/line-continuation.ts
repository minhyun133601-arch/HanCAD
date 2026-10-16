import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';

/** Enter at LINE's first prompt continues the most recently created line, polyline or arc. */
export function lineContinuation(
  entities: readonly CadEntity[],
): { point: CadPoint; tangent?: CadPoint } | undefined {
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index];
    if (entity?.type === 'line') return { point: { ...entity.b } };
    if (entity?.type === 'polyline' || entity?.type === 'rect') {
      const point = entity.closed ? entity.points[0] : entity.points.at(-1);
      if (point) return { point: { ...point } };
    }
    if (entity?.type === 'arc') {
      const angle = entity.endAngle,
        direction = entity.clockwise ? 1 : -1;
      return {
        point: {
          x: entity.center.x + entity.radius * Math.cos(angle),
          y: entity.center.y + entity.radius * Math.sin(angle),
        },
        tangent: { x: -Math.sin(angle) * direction, y: Math.cos(angle) * direction },
      };
    }
  }
  return undefined;
}
