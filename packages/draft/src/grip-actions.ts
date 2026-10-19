import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import type { EntityGrip, GripAction } from './grip-types';
import { gripBulgeThrough } from './grip-geometry';
export { gripBulgeThrough } from './grip-geometry';

function editVertexWidths(
  entity: CadPolyline,
  index: number,
  target?: CadPoint,
): Pick<CadPolyline, 'startWidths' | 'endWidths'> {
  if (!entity.startWidths && !entity.endWidths) return {};
  const start = entity.points.map((_, i) => entity.startWidths?.[i] ?? entity.constantWidth ?? 0),
    end = entity.points.map((_, i) => entity.endWidths?.[i] ?? entity.constantWidth ?? 0),
    last = entity.points.length - 1;
  if (target) {
    if (!entity.closed && index === last) {
      start[index] = end[index] = end[index - 1] ?? entity.constantWidth ?? 0;
      start.push(0);
      end.push(0);
    } else {
      const a = entity.points[index]!,
        b = entity.points[(index + 1) % entity.points.length]!,
        before = Math.hypot(target.x - a.x, target.y - a.y),
        after = Math.hypot(b.x - target.x, b.y - target.y),
        fraction = before + after > 0 ? before / (before + after) : 0.5;
      const first = start[index]!,
        final = end[index]!,
        middle = first + (final - first) * fraction;
      end[index] = middle;
      start.splice(index + 1, 0, middle);
      end.splice(index + 1, 0, final);
    }
  } else {
    if (entity.closed || index > 0) {
      const previous = (index - 1 + entity.points.length) % entity.points.length;
      end[previous] = end[index]!;
      if (!entity.closed && index === last) start[previous] = end[previous] = 0;
    }
    start.splice(index, 1);
    end.splice(index, 1);
  }
  return { startWidths: start, endWidths: end };
}

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
    Object.assign(result, editVertexWidths(entity, index));
    result.points.splice(index, 1);
    bulges.splice(index, 1);
    bulges[(index - 1 + bulges.length) % bulges.length] = 0;
  } else if (action === 'addVertex' && target) {
    const atEnd = !result.closed && index === result.points.length - 1;
    Object.assign(result, editVertexWidths(entity, index, target));
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
