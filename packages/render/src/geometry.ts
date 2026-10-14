import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadBounds, CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { simplifyPoints } from './lod';

export function strokeGeometry(entity: CadEntity): boolean {
  return ['line', 'polyline', 'rect', 'circle', 'arc'].includes(entity.type);
}

export function entityBounds(entity: CadEntity): CadBounds | null {
  if (entity.type === 'circle' || entity.type === 'arc') {
    const { x, y } = entity.center,
      r = entity.radius;
    return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
  }
  if (entity.type === 'line')
    return {
      minX: Math.min(entity.a.x, entity.b.x),
      minY: Math.min(entity.a.y, entity.b.y),
      maxX: Math.max(entity.a.x, entity.b.x),
      maxY: Math.max(entity.a.y, entity.b.y),
    };
  if (entity.type === 'polyline' || entity.type === 'rect') {
    if (!entity.points.length) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const point of entity.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { minX, minY, maxX, maxY };
  }
  const bounds = getLegacyRuntime().core.cadEngine.bounds(entity);
  if (!bounds) return null;
  // The engine's label bounds are conservative; extra room covers font substitutions and units.
  const margin =
    entity.type === 'text'
      ? entity.textSize * 2
      : entity.type === 'dimension'
        ? entity.textSize * entity.dimScale * 8
        : 0;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

export function appendStroke(
  path: Path2D,
  entity: CadEntity,
  origin: CadPoint,
  tolerance = 0,
): void {
  const move = (p: CadPoint): void => path.moveTo(p.x - origin.x, p.y - origin.y);
  const line = (p: CadPoint): void => path.lineTo(p.x - origin.x, p.y - origin.y);
  if (tolerance && entity.type !== 'line') {
    const bounds = entityBounds(entity);
    if (bounds && Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) <= tolerance) {
      const center = {
        x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
        y: bounds.minY + (bounds.maxY - bounds.minY) / 2,
      };
      move(center);
      line({ x: center.x + tolerance * 0.0001, y: center.y });
      return;
    }
  }
  if (entity.type === 'line') {
    move(entity.a);
    line(entity.b);
  } else if (entity.type === 'polyline' || entity.type === 'rect') {
    const points =
      entity.type === 'polyline' ? simplifyPoints(entity.points, tolerance) : entity.points;
    const first = points[0];
    if (!first) return;
    move(first);
    for (let i = 1; i < points.length; i++) line(points[i]!);
    if (entity.closed || entity.type === 'rect') path.closePath();
  } else if (entity.type === 'circle' || entity.type === 'arc') {
    const tau = Math.PI * 2;
    const start = entity.type === 'circle' ? 0 : entity.startAngle;
    const normalize = (angle: number): number => ((angle % tau) + tau) % tau;
    const sweep =
      entity.type === 'circle'
        ? tau
        : Math.abs(entity.endAngle - start) >= tau - 1e-9
          ? entity.clockwise
            ? tau
            : -tau
          : entity.clockwise
            ? normalize(entity.endAngle - start)
            : -normalize(start - entity.endAngle);
    move({
      x: entity.center.x + entity.radius * Math.cos(start),
      y: entity.center.y + entity.radius * Math.sin(start),
    });
    path.arc(
      entity.center.x - origin.x,
      entity.center.y - origin.y,
      entity.radius,
      start,
      start + sweep,
      entity.type === 'arc' && !entity.clockwise,
    );
  }
}

export function overlaps(a: CadBounds, b: CadBounds, padding = 0): boolean {
  return (
    a.maxX + padding >= b.minX &&
    a.minX - padding <= b.maxX &&
    a.maxY + padding >= b.minY &&
    a.minY - padding <= b.maxY
  );
}

export function relativeEntity(entity: CadEntity, origin: CadPoint): CadEntity {
  const point = (p: CadPoint): CadPoint => ({ x: p.x - origin.x, y: p.y - origin.y });
  if (entity.type === 'line') return { ...entity, a: point(entity.a), b: point(entity.b) };
  if (entity.type === 'circle' || entity.type === 'arc')
    return { ...entity, center: point(entity.center) };
  if (entity.type === 'polyline' || entity.type === 'rect')
    return { ...entity, points: entity.points.map(point) };
  if (entity.type === 'text') return { ...entity, point: point(entity.point) };
  if (entity.type === 'dimension')
    return {
      ...entity,
      ...(entity.a && { a: point(entity.a) }),
      ...(entity.b && { b: point(entity.b) }),
      ...(entity.center && { center: point(entity.center) }),
      ...(entity.placement && { placement: point(entity.placement) }),
    };
  return entity;
}
