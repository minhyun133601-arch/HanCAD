import type { Bounds2, DisplayTriangle, DisplayTriangleRun, Vec2 } from '../display/types';
import { encodeDashSegment } from './dash-distance';

export interface DashPattern {
  length: number;
  first: number;
}
interface MeasuredPoint extends Vec2 {
  distance: number;
}
interface FillPiece {
  points: readonly MeasuredPoint[];
  length: number;
}
function clip(
  points: readonly MeasuredPoint[],
  value: (p: MeasuredPoint) => number,
): MeasuredPoint[] {
  const result: MeasuredPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!,
      da = value(a),
      db = value(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        distance: a.distance + (b.distance - a.distance) * t,
      });
    }
  }
  return result;
}
/** Clip a ribbon in the centerline-distance plane before reducing its dash phase. */
export function measuredFill(
  triangle: DisplayTriangle,
  run: DisplayTriangleRun,
  pattern: DashPattern,
  tolerance: number,
  view?: Bounds2,
): FillPiece[] {
  let points: MeasuredPoint[] = triangle.map((p, i) => ({ ...p, distance: run.distances[i]! }));
  if (view)
    for (const [axis, bound, sign] of [
      ['x', view.minX, 1],
      ['x', view.maxX, -1],
      ['y', view.minY, 1],
      ['y', view.maxY, -1],
    ] as const)
      points = clip(points, (p) => sign * (p[axis] - bound));
  if (points.length < 3) return [];
  const low = Math.max(0, Math.min(...points.map((p) => p.distance))),
    high = Math.min(run.length, Math.max(...points.map((p) => p.distance)));
  const slices = encodeDashSegment(low, high, run.length, pattern.length, pattern.first, {
    maxLocalDistance: tolerance * 2 ** 20,
  });
  return slices.flatMap((slice) => {
    const start = low + (high - low) * slice.from,
      end = low + (high - low) * slice.to;
    const polygon = clip(
      clip(points, (p) => p.distance - start),
      (p) => end - p.distance,
    );
    const local = polygon.map((p) => ({
      ...p,
      distance: slice.patterned
        ? slice.start +
          (end === start ? 0 : ((p.distance - start) / (end - start)) * (slice.end - slice.start))
        : 0,
    }));
    return local.length < 3 ? [] : [{ points: local, length: slice.patterned ? -1 : 0 }];
  });
}
