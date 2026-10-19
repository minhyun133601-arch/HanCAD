import type { DisplayTriangle, Vec2 } from './types';

const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** Ear clipping preserves concave masks without triangles crossing the boundary. */
export function triangulatePolygon(source: readonly Vec2[]): DisplayTriangle[] {
  const points = source.filter(
    (point, i) => !i || point.x !== source[i - 1]!.x || point.y !== source[i - 1]!.y,
  );
  if (points.length > 1 && points[0]!.x === points.at(-1)!.x && points[0]!.y === points.at(-1)!.y)
    points.pop();
  if (points.length < 3) return [];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    area += cross(points[0]!, a, b);
  }
  if (Math.abs(area) < 1e-20) return [];
  const sign = area >= 0 ? 1 : -1,
    indices = points.map((_, i) => i),
    triangles: DisplayTriangle[] = [];
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) =>
    cross(a, b, p) * sign >= -1e-12 &&
    cross(b, c, p) * sign >= -1e-12 &&
    cross(c, a, p) * sign >= -1e-12;
  let attempts = 0;
  while (indices.length > 3) {
    let found = false;
    for (let i = 0; i < indices.length; i++) {
      const ia = indices[(i - 1 + indices.length) % indices.length]!,
        ib = indices[i]!,
        ic = indices[(i + 1) % indices.length]!;
      const a = points[ia]!,
        b = points[ib]!,
        c = points[ic]!;
      if (cross(a, b, c) * sign <= 1e-12) continue;
      if (
        indices.some(
          (index) =>
            index !== ia && index !== ib && index !== ic && inside(points[index]!, a, b, c),
        )
      )
        continue;
      triangles.push([a, b, c]);
      indices.splice(i, 1);
      found = true;
      break;
    }
    if (!found || ++attempts > source.length) throw new Error('Invalid polygon boundary.');
  }
  triangles.push([points[indices[0]!]!, points[indices[1]!]!, points[indices[2]!]!]);
  return triangles;
}
