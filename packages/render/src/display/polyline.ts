import { bulgeArc } from '@hancad/geom';
import type { DisplayArc, DisplayLine, DisplayPolyline, DisplayTriangle, Vec2 } from './types';
import { arcAt, arcSegmentCount } from './curves';

export interface PolylineSegment {
  geometry: DisplayLine | DisplayArc;
  startWidth: number;
  endWidth: number;
}
export function polylineSegments(polyline: DisplayPolyline): PolylineSegment[] {
  const vertices = polyline.vertices,
    count = vertices.length / 5;
  const result: PolylineSegment[] = [];
  for (let i = 0; i < count - (polyline.closed ? 0 : 1); i++) {
    const a = i * 5,
      b = ((i + 1) % count) * 5;
    const start = { x: vertices[a]!, y: vertices[a + 1]! },
      end = { x: vertices[b]!, y: vertices[b + 1]! };
    const arc = bulgeArc(start, end, vertices[a + 2]!);
    result.push({
      geometry: arc ? { type: 'arc', ...arc, startPoint: start } : { type: 'line', start, end },
      startWidth: Math.max(0, vertices[a + 3]!),
      endWidth: Math.max(0, vertices[a + 4]!),
    });
  }
  return result;
}
export function segmentAt(segment: PolylineSegment, t: number): { point: Vec2; tangent: Vec2 } {
  const geometry = segment.geometry;
  if (geometry.type === 'line')
    return {
      point: {
        x: geometry.start.x + (geometry.end.x - geometry.start.x) * t,
        y: geometry.start.y + (geometry.end.y - geometry.start.y) * t,
      },
      tangent: { x: geometry.end.x - geometry.start.x, y: geometry.end.y - geometry.start.y },
    };
  const angle = geometry.startAngle + geometry.sweepAngle * t,
    sign = Math.sign(geometry.sweepAngle);
  return {
    point: arcAt(geometry, t),
    tangent: { x: -Math.sin(angle) * sign, y: Math.cos(angle) * sign },
  };
}
export function segmentSide(segment: PolylineSegment, t: number, side: number): Vec2 {
  const { point, tangent } = segmentAt(segment, t),
    length = Math.hypot(tangent.x, tangent.y);
  const half = (segment.startWidth + (segment.endWidth - segment.startWidth) * t) / 2;
  return length
    ? {
        x: point.x - (tangent.y / length) * half * side,
        y: point.y + (tangent.x / length) * half * side,
      }
    : point;
}
export function segmentLength(segment: PolylineSegment): number {
  const geometry = segment.geometry;
  return geometry.type === 'arc'
    ? Math.abs(geometry.radius * geometry.sweepAngle)
    : Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y);
}
function sideDerivative(segment: PolylineSegment, t: number, side: number): Vec2 {
  const geometry = segment.geometry,
    { tangent } = segmentAt(segment, t);
  const speed =
    geometry.type === 'arc'
      ? Math.abs(geometry.radius * geometry.sweepAngle)
      : Math.hypot(tangent.x, tangent.y);
  const length = Math.hypot(tangent.x, tangent.y);
  if (!length) return { x: 0, y: 0 };
  const half = (segment.startWidth + (segment.endWidth - segment.startWidth) * t) / 2;
  const scale =
    geometry.type === 'arc'
      ? 1 - (side * Math.sign(geometry.sweepAngle) * half) / geometry.radius
      : 1;
  const taper = (side * (segment.endWidth - segment.startWidth)) / 2;
  return {
    x: (tangent.x / length) * speed * scale - (tangent.y / length) * taper,
    y: (tangent.y / length) * speed * scale + (tangent.x / length) * taper,
  };
}
export function polylineJointTriangles(
  segments: readonly PolylineSegment[],
  closed: boolean,
  emit?: (triangle: DisplayTriangle, beforeSegment: number) => void,
): DisplayTriangle[] {
  const triangles: DisplayTriangle[] = [];
  for (let i = 0; i < segments.length - (closed ? 0 : 1); i++) {
    const before = segments[i]!,
      after = segments[(i + 1) % segments.length]!;
    if (!before.endWidth || !after.startWidth) continue;
    for (const side of [-1, 1]) {
      const a = segmentSide(before, 1, side),
        b = segmentSide(after, 0, side);
      const da = sideDerivative(before, 1, side),
        db = sideDerivative(after, 0, side);
      const determinant = da.x * db.y - da.y * db.x;
      if (Math.abs(determinant) <= 1e-12 * Math.hypot(da.x, da.y) * Math.hypot(db.x, db.y))
        continue;
      const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / determinant;
      const triangle: DisplayTriangle = [a, { x: a.x + da.x * t, y: a.y + da.y * t }, b];
      triangles.push(triangle);
      emit?.(triangle, i);
    }
  }
  return triangles;
}
export function segmentTriangles(
  segment: PolylineSegment,
  tolerance: number,
  cap = 8192,
): DisplayTriangle[] {
  const geometry = segment.geometry;
  const count =
    geometry.type === 'arc'
      ? arcSegmentCount(
          geometry.radius + Math.max(segment.startWidth, segment.endWidth) / 2,
          geometry.sweepAngle,
          tolerance,
          cap,
        )
      : 1;
  const triangles: DisplayTriangle[] = [];
  for (let i = 0; i < count; i++) {
    const a = segmentSide(segment, i / count, 1),
      b = segmentSide(segment, i / count, -1);
    const c = segmentSide(segment, (i + 1) / count, -1),
      d = segmentSide(segment, (i + 1) / count, 1);
    triangles.push([a, b, c], [a, c, d]);
  }
  return triangles;
}
