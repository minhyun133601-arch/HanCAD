import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import type { EntityGrip, GripAction } from './grip-types';
import { gripBulgeThrough } from './grip-geometry';
export { gripBulgeThrough } from './grip-geometry';

export function applyGripAction(
  entity: CadEntity,
  grip: EntityGrip,
  action: GripAction,
  target?: CadPoint,
): CadEntity | undefined {
  if (entity.id !== grip.entityId || !grip.actions.includes(action)) return;
  if (action === 'lengthen' && entity.type === 'line' && target) {
    const field = grip.key === 'a' ? 'a' : 'b',
      origin = field === 'a' ? entity.b : entity.a;
    const end = entity[field],
      dx = end.x - origin.x,
      dy = end.y - origin.y,
      length2 = dx * dx + dy * dy;
    if (length2 < 1e-20) return;
    const factor = ((target.x - origin.x) * dx + (target.y - origin.y) * dy) / length2;
    if (factor <= 1e-10) return;
    return { ...entity, [field]: { ...end, x: origin.x + dx * factor, y: origin.y + dy * factor } };
  }
  if (entity.type !== 'polyline' && entity.type !== 'rect') return;
  const result: CadPolyline = structuredClone(entity),
    index = Number(grip.key.slice(1));
  if (!Number.isInteger(index) || index < 0 || index >= entity.points.length) return;
  const bulges = result.points.map((_, i) => result.bulges?.[i] ?? 0);
  if (action === 'removeVertex') {
    if (result.points.length <= 2) return;
    result.points.splice(index, 1);
    bulges.splice(index, 1);
    bulges[(index - 1 + bulges.length) % bulges.length] = 0;
  } else if (action === 'addVertex' && target) {
    const atEnd = !result.closed && index === result.points.length - 1;
    result.points.splice(index + 1, 0, { ...target });
    bulges.splice(index + 1, 0, 0);
    bulges[index] = 0;
    if (atEnd) bulges[index + 1] = 0;
  } else if (action === 'convertLine') bulges[index] = 0;
  else if (action === 'convertArc' && target) {
    const a = result.points[index]!,
      b = result.points[(index + 1) % result.points.length]!;
    const bulge = gripBulgeThrough(a, target, b);
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-12) return;
    bulges[index] = bulge;
  } else return;
  return { ...result, type: 'polyline', bulges };
}
