import type { Bounds2, DisplayGeometry, DisplayLine } from './types';

/** Slab clipping retains a ray's forward half and handles axis-aligned directions. */
export function clipInfinite(
  geometry: Extract<DisplayGeometry, { type: 'xline' | 'ray' }>,
  view: Bounds2,
): DisplayLine | undefined {
  let low = geometry.type === 'ray' ? 0 : -Infinity,
    high = Infinity;
  for (const [position, direction, min, max] of [
    [geometry.basePoint.x, geometry.direction.x, view.minX, view.maxX],
    [geometry.basePoint.y, geometry.direction.y, view.minY, view.maxY],
  ] as const) {
    if (direction === 0) {
      if (position < min || position > max) return;
    } else {
      const a = (min - position) / direction,
        b = (max - position) / direction;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
  }
  if (low > high || !Number.isFinite(low) || !Number.isFinite(high)) return;
  const at = (t: number) => ({
    x: geometry.basePoint.x + t * geometry.direction.x,
    y: geometry.basePoint.y + t * geometry.direction.y,
  });
  return { type: 'line', start: at(low), end: at(high) };
}
