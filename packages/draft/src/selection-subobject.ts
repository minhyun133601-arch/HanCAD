import { bulgeArc } from '@hancad/geom';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';

/** Segment indices remain stable and refer to the same outgoing vertex as bulges. */
export function closestCadPolylineSegment(
  entity: CadPolyline,
  point: CadPoint,
): number | undefined {
  let index: number | undefined,
    best = Infinity;
  const count = entity.points.length - (entity.closed ? 0 : 1),
    turn = Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = entity.points[i]!,
      b = entity.points[(i + 1) % entity.points.length]!;
    const arc = bulgeArc(a, b, entity.bulges?.[i] ?? 0);
    let distance: number;
    if (arc) {
      const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
      const raw = arc.sweepAngle >= 0 ? angle - arc.startAngle : arc.startAngle - angle;
      const offset = ((raw % turn) + turn) % turn;
      distance =
        offset <= Math.abs(arc.sweepAngle) + 1e-10
          ? Math.abs(Math.hypot(point.x - arc.center.x, point.y - arc.center.y) - arc.radius)
          : Math.min(
              Math.hypot(point.x - a.x, point.y - a.y),
              Math.hypot(point.x - b.x, point.y - b.y),
            );
    } else {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      distance = Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
    }
    if (distance < best) {
      best = distance;
      index = i;
    }
  }
  return index;
}
