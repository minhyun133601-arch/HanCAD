import type { Bounds2, Vec2 } from '../display/types';

/** Liang-Barsky also returns source parameters, retaining original dash distances. */
export function clipSegment(
  a: Vec2,
  b: Vec2,
  view: Bounds2,
): readonly [number, number] | undefined {
  let low = 0,
    high = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - view.minX],
    [dx, view.maxX - a.x],
    [-dy, a.y - view.minY],
    [dy, view.maxY - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return undefined;
  }
  return [low, high];
}
export function clipPolygon(input: readonly Vec2[], view: Bounds2): Vec2[] {
  let points = [...input];
  for (const [axis, value, sign] of [
    ['x', view.minX, 1],
    ['x', view.maxX, -1],
    ['y', view.minY, 1],
    ['y', view.maxY, -1],
  ] as const) {
    const result: Vec2[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!,
        b = points[(i + 1) % points.length]!;
      const insideA = sign * (a[axis] - value) >= 0,
        insideB = sign * (b[axis] - value) >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    points = result;
  }
  return points;
}
