import { circularSegmentArea } from './geometry';
import type {
  ArcGeometry,
  GeometryBounds,
  LineGeometry,
  PolylineGeometry,
  Vec3,
} from './curve-types';
import { conicBounds, conicEvaluation, linearBounds, linearEvaluation } from './analytic-curves';
import {
  add3,
  bounds3,
  clampUnit,
  cross3,
  distance3,
  dot3,
  interpolate3,
  magnitude3,
  normalize3,
  scale3,
  subtract3,
} from './vector3';

export interface PolylineSegment {
  geometry: LineGeometry | ArcGeometry;
  startWidth: number;
  endWidth: number;
}
export function polylineSegments(polyline: PolylineGeometry): PolylineSegment[] {
  const result: PolylineSegment[] = [],
    count = polyline.vertices.length - (polyline.closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const start = polyline.vertices[i]!,
      end = polyline.vertices[(i + 1) % polyline.vertices.length]!;
    const chord = distance3(start.position, end.position),
      bulge = polyline.is3D ? 0 : start.bulge;
    let geometry: LineGeometry | ArcGeometry = {
      type: 'LINE',
      start: start.position,
      end: end.position,
    };
    if (chord && bulge) {
      const center = add3(
        interpolate3(start.position, end.position, 0.5),
        scale3(
          cross3(polyline.normal, subtract3(end.position, start.position)),
          (1 - bulge * bulge) / (4 * bulge),
        ),
      );
      const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
      geometry = {
        type: 'ARC',
        center,
        radius,
        normal: polyline.normal,
        xAxis: normalize3(subtract3(start.position, center)),
        startAngle: 0,
        sweepAngle: 4 * Math.atan(bulge),
        startPoint: start.position,
      };
    }
    result.push({
      geometry,
      startWidth: polyline.is3D ? 0 : start.startWidth,
      endWidth: polyline.is3D ? 0 : start.endWidth,
    });
  }
  return result;
}
export function polylineEvaluation3(
  polyline: PolylineGeometry,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  const segments = polylineSegments(polyline),
    position = clampUnit(parameter) * segments.length;
  const index = Math.min(segments.length - 1, Math.floor(position)),
    segment = segments[index]!.geometry;
  const result =
    segment.type === 'LINE'
      ? linearEvaluation(segment, position - index)
      : conicEvaluation(segment, position - index);
  return { point: result.point, derivative: scale3(result.derivative, segments.length) };
}
export function polylineLength3(polyline: PolylineGeometry): number {
  return polylineSegments(polyline).reduce(
    (length, segment) =>
      length +
      (segment.geometry.type === 'LINE'
        ? distance3(segment.geometry.start, segment.geometry.end)
        : Math.abs(segment.geometry.radius * segment.geometry.sweepAngle)),
    0,
  );
}
export function planarNormal(points: readonly Vec3[]): Vec3 | undefined {
  const origin = points[0];
  if (!origin) return undefined;
  let normal: Vec3 | undefined;
  for (let i = 1; i < points.length - 1; i++) {
    const cross = cross3(subtract3(points[i]!, origin), subtract3(points[i + 1]!, origin));
    if (magnitude3(cross) > 1e-14) {
      normal = normalize3(cross);
      break;
    }
  }
  if (!normal) return { x: 0, y: 0, z: 1 };
  let scale = 1;
  for (const point of points) scale = Math.max(scale, distance3(point, origin));
  return points.every((point) => Math.abs(dot3(subtract3(point, origin), normal!)) <= scale * 1e-10)
    ? normal
    : undefined;
}
export function polylineArea3(polyline: PolylineGeometry): number | undefined {
  const positions = polyline.vertices.map((v) => v.position);
  const normal = polyline.is3D ? planarNormal(positions) : polyline.normal;
  if (!normal) return undefined;
  const origin = positions[0]!,
    count = positions.length;
  let area = 0;
  for (let i = 0; i < count; i++) {
    const a = subtract3(positions[i]!, origin),
      b = subtract3(positions[(i + 1) % count]!, origin);
    area += dot3(cross3(a, b), normal) / 2;
    // An open object's final straight closure never uses the final vertex's stored bulge.
    if (i === count - 1 && !polyline.closed) continue;
    const vertex = polyline.vertices[i]!,
      chord = distance3(positions[i]!, positions[(i + 1) % count]!);
    if (!polyline.is3D && chord && vertex.bulge) {
      const radius = (chord * (1 + vertex.bulge * vertex.bulge)) / (4 * Math.abs(vertex.bulge)),
        sweep = 4 * Math.atan(vertex.bulge);
      area += circularSegmentArea(radius, sweep);
    }
  }
  return Math.abs(area);
}
/** Width bounds include tapered ribbons and adjacent tangent miters; curved widths are conservative. */
export function polylineBounds3(polyline: PolylineGeometry): GeometryBounds {
  const segments = polylineSegments(polyline),
    points: Vec3[] = [];
  let quality: GeometryBounds['quality'] = 'exact';
  const sideEnds: { start: Vec3; end: Vec3; startDirection: Vec3; endDirection: Vec3 }[][] = [];
  for (const { geometry, startWidth, endWidth } of segments) {
    const bounds = geometry.type === 'LINE' ? linearBounds(geometry) : conicBounds(geometry);
    points.push(bounds.min, bounds.max);
    const width = Math.max(startWidth, endWidth) / 2;
    if (!width) {
      sideEnds.push([]);
      continue;
    }
    const evaluate = (t: number) =>
      geometry.type === 'LINE' ? linearEvaluation(geometry, t) : conicEvaluation(geometry, t);
    const ends = [evaluate(0), evaluate(1)];
    const directions = ends.map((end) =>
      magnitude3(end.derivative)
        ? normalize3(cross3(polyline.normal, end.derivative))
        : { x: 0, y: 0, z: 0 },
    );
    const sides = [1, -1].map((side) => {
      const boundaryDirection = (index: number, width: number) => {
        const factor =
          geometry.type === 'ARC'
            ? 1 - (side * Math.sign(geometry.sweepAngle) * width) / (2 * geometry.radius)
            : 1;
        return add3(
          scale3(ends[index]!.derivative, factor),
          scale3(directions[index]!, (side * (endWidth - startWidth)) / 2),
        );
      };
      return {
        start: add3(ends[0]!.point, scale3(directions[0]!, (side * startWidth) / 2)),
        end: add3(ends[1]!.point, scale3(directions[1]!, (side * endWidth) / 2)),
        startDirection: boundaryDirection(0, startWidth),
        endDirection: boundaryDirection(1, endWidth),
      };
    });
    for (const side of sides) points.push(side.start, side.end);
    sideEnds.push(sides);
    if (geometry.type === 'ARC') {
      quality = 'conservative';
      const x = geometry.xAxis,
        y = cross3(geometry.normal, x);
      const expansion = {
        x: width * Math.hypot(x.x, y.x),
        y: width * Math.hypot(x.y, y.y),
        z: width * Math.hypot(x.z, y.z),
      };
      points.push(subtract3(bounds.min, expansion), add3(bounds.max, expansion));
    }
  }
  for (let i = 0; i < sideEnds.length - (polyline.closed ? 0 : 1); i++) {
    const next = (i + 1) % sideEnds.length;
    for (let side = 0; side < 2; side++) {
      const a = sideEnds[i]![side],
        b = sideEnds[next]![side];
      if (!a || !b) continue;
      const da = a.endDirection,
        db = b.startDirection;
      const denominator = dot3(cross3(da, db), polyline.normal);
      if (Math.abs(denominator) <= 1e-12 * magnitude3(da) * magnitude3(db)) continue;
      const t = dot3(cross3(subtract3(b.start, a.end), db), polyline.normal) / denominator;
      points.push(add3(a.end, scale3(da, t)));
    }
  }
  return { ...bounds3(points)!, kind: 'finite', quality };
}
