import type { CadPoint } from '@hancad/legacy-bridge';

/** Douglas–Peucker simplification bounds display deviation; source model points are unchanged. */
export function simplifyPoints(
  points: readonly CadPoint[],
  tolerance: number,
): readonly CadPoint[] {
  if (points.length < 4 || tolerance <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [0, points.length - 1],
    squared = tolerance * tolerance;
  while (stack.length) {
    const last = stack.pop()!,
      first = stack.pop()!,
      a = points[first]!,
      b = points[last]!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    let furthest = -1,
      maximum = squared;
    for (let index = first + 1; index < last; index++) {
      const point = points[index]!;
      const t = length
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
        : 0;
      const x = point.x - a.x - t * dx,
        y = point.y - a.y - t * dy,
        distance = x * x + y * y;
      if (distance > maximum) {
        maximum = distance;
        furthest = index;
      }
    }
    if (furthest >= 0) {
      keep[furthest] = 1;
      stack.push(first, furthest, furthest, last);
    }
  }
  return points.filter((_point, index) => keep[index]);
}
