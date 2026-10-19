import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { DrawContext, DrawValue } from './draw-program';
import { parseDraftAngle, parseDraftNumber } from './coordinate-units';
import { drawPoint } from './draw-program';
import { transformGripEntity } from './grip-transform';
import { modifyId, modifyResult } from './modify-common';

export const origin: CadPoint = { x: 0, y: 0, z: 0 };
export const deltaPoint = (a: CadPoint, b: CadPoint): CadPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  ...(a.z === undefined && b.z === undefined ? {} : { z: (a.z ?? 0) - (b.z ?? 0) }),
});
export const pointDistance = (a: CadPoint, b: CadPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export function transformNumber(value: DrawValue, context: DrawContext): number | undefined {
  return typeof value === 'string' ? parseDraftNumber(value, context.coordinates()) : undefined;
}
/** Relative command angles ignore ANGBASE; ANGDIR and angular notation remain effective. */
export function transformAngle(
  value: DrawValue,
  context: DrawContext,
  base: CadPoint,
): number | undefined {
  const point = drawPoint(value);
  if (point)
    return pointDistance(base, point) > 1e-12
      ? Math.atan2(base.y - point.y, point.x - base.x)
      : undefined;
  return typeof value === 'string'
    ? parseDraftAngle(value, { ...context.coordinates(), angbase: 0 })
    : undefined;
}
export function transformEntities(
  originals: readonly CadEntity[],
  mode: 'MOVE' | 'ROTATE' | 'SCALE' | 'MIRROR',
  base: CadPoint,
  value: number | CadPoint,
  copy = false,
  mirrorText = false,
): CadEntity[] {
  return originals.map((entity) => {
    const result = transformGripEntity(entity, mode, base, value, mirrorText);
    if (copy) result.id = modifyId();
    return result;
  });
}
export function transformedResult(
  originals: readonly CadEntity[],
  entities: CadEntity[],
  copy: boolean,
) {
  return copy ? { entities } : modifyResult(originals, entities);
}
export function entityAnchor(entity: CadEntity): CadPoint {
  switch (entity.type) {
    case 'line':
      return entity.a;
    case 'circle':
    case 'arc':
      return entity.center;
    case 'text':
      return entity.point;
    case 'polyline':
    case 'rect':
      return entity.points[0] ?? origin;
    case 'dimension':
      return entity.a ?? entity.center ?? entity.placement ?? origin;
  }
}
