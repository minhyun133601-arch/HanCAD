import { geometryBounds } from '@hancad/geom';
import { arcAt } from './curves';
import { clipInfinite } from './infinite';
import { pointSymbolGeometry } from './point-symbols';
import { polylineJointTriangles, polylineSegments } from './polyline';
import { textCorners } from './text';
import type { Bounds2, DisplayGeometry, TessellationOptions, Vec2 } from './types';

export function boundsOfPoints(points: readonly Vec2[]): Bounds2 | undefined {
  if (!points.length) return;
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    result.minX = Math.min(result.minX, point.x);
    result.minY = Math.min(result.minY, point.y);
    result.maxX = Math.max(result.maxX, point.x);
    result.maxY = Math.max(result.maxY, point.y);
  }
  return result;
}
export function unionBounds(a: Bounds2 | undefined, b: Bounds2 | undefined): Bounds2 | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
export function boundsIntersect(a: Bounds2, b: Bounds2): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
export function boundsOfGeometry(
  geometry: DisplayGeometry,
  options: Partial<TessellationOptions> = {},
): Bounds2 | undefined {
  switch (geometry.type) {
    case 'line':
      return boundsOfPoints([geometry.start, geometry.end]);
    case 'arc': {
      if (geometry.sweepAngle === 0) return boundsOfPoints([arcAt(geometry, 0)]);
      const points = [arcAt(geometry, 0), arcAt(geometry, 1)],
        tau = Math.PI * 2;
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const local = Math.sign(geometry.sweepAngle) * (angle - geometry.startAngle);
        const directed = local >= 0 && local < tau ? local : ((local % tau) + tau) % tau;
        if (directed <= Math.abs(geometry.sweepAngle))
          points.push(arcAt(geometry, directed / Math.abs(geometry.sweepAngle)));
      }
      return boundsOfPoints(points);
    }
    case 'text':
      return boundsOfPoints(textCorners(geometry));
    case 'xline':
    case 'ray': {
      if (!options.view) return;
      const line = clipInfinite(geometry, options.view);
      return line ? boundsOfGeometry(line) : undefined;
    }
    case 'point': {
      const symbol = pointSymbolGeometry(geometry.position, options);
      if (symbol.type !== 'composite') return;
      return symbol.parts.reduce<Bounds2 | undefined>(
        (bounds, part) =>
          unionBounds(
            bounds,
            part.type === 'point'
              ? boundsOfPoints([part.position])
              : boundsOfGeometry(part, options),
          ),
        undefined,
      );
    }
    case 'composite': {
      let bounds: Bounds2 | undefined;
      for (const part of geometry.parts)
        bounds = unionBounds(bounds, boundsOfGeometry(part, options));
      for (const triangle of geometry.triangles)
        bounds = unionBounds(bounds, boundsOfPoints(triangle));
      return bounds;
    }
    case 'curve': {
      let source = geometry.curve;
      while (source.type === 'TRANSFORMED') source = source.source;
      if (source.type === 'XLINE' || source.type === 'RAY') return;
      const bounds = geometryBounds(geometry.curve);
      if (bounds.kind === 'unbounded') return;
      return { minX: bounds.min.x, minY: bounds.min.y, maxX: bounds.max.x, maxY: bounds.max.y };
    }
    case 'polyline': {
      const segments = polylineSegments(geometry);
      let bounds: Bounds2 | undefined;
      for (const segment of segments) {
        const current = boundsOfGeometry(segment.geometry)!;
        const half = Math.max(segment.startWidth, segment.endWidth) / 2;
        bounds = unionBounds(bounds, {
          minX: current.minX - half,
          minY: current.minY - half,
          maxX: current.maxX + half,
          maxY: current.maxY + half,
        });
      }
      for (const triangle of polylineJointTriangles(segments, geometry.closed))
        bounds = unionBounds(bounds, boundsOfPoints(triangle));
      return bounds;
    }
  }
}
