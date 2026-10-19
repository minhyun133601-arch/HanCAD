import { geometryEvaluation, type InfiniteGeometry, type SplineGeometry } from '@hancad/geom';
import { concatenateSplines, curveSpline } from './modify-spline-geometry';

/** AutoCAD EXTEND appends a straight tangent section and preserves the original NURBS. */
export function tangentSplineExtension(
  source: SplineGeometry,
  start: boolean,
  cuts: (ray: InfiniteGeometry) => readonly number[],
): SplineGeometry | undefined {
  const endpoint = geometryEvaluation(source, start ? 0 : 1),
    d = endpoint.derivative,
    length = Math.hypot(d.x, d.y, d.z),
    sign = start ? -1 : 1;
  if (length < 1e-12) return;
  const ray: InfiniteGeometry = {
    type: 'RAY',
    basePoint: endpoint.point,
    direction: { x: (d.x * sign) / length, y: (d.y * sign) / length, z: (d.z * sign) / length },
  };
  const distance = cuts(ray)
    .filter((t) => t > 1e-9)
    .sort((a, b) => a - b)[0];
  if (distance === undefined) return;
  const point = {
    x: endpoint.point.x + ray.direction.x * distance,
    y: endpoint.point.y + ray.direction.y * distance,
    z: endpoint.point.z + ray.direction.z * distance,
  };
  const extension = curveSpline({
    type: 'LINE',
    start: start ? point : endpoint.point,
    end: start ? endpoint.point : point,
  });
  if (!extension) return;
  return concatenateSplines(start ? [extension, source] : [source, extension]);
}
