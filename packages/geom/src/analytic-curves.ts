import type {
  ArcGeometry,
  CircleGeometry,
  CurveGeometry,
  EllipseGeometry,
  GeometryBounds,
  Vec3,
} from './curve-types';
import {
  add3,
  bounds3,
  clampUnit,
  cross3,
  dot3,
  interpolate3,
  normalizedAngle,
  scale3,
  subtract3,
} from './vector3';

export type ConicGeometry = CircleGeometry | ArcGeometry | EllipseGeometry;
export function conicComponents(curve: ConicGeometry): {
  a: Vec3;
  b: Vec3;
  start: number;
  sweep: number;
} {
  if (curve.type === 'ELLIPSE')
    return {
      a: curve.majorAxis,
      b: curve.minorAxis,
      start: curve.startParameter,
      sweep: curve.sweepParameter,
    };
  return {
    a: scale3(curve.xAxis, curve.radius),
    b: scale3(cross3(curve.normal, curve.xAxis), curve.radius),
    start: curve.type === 'ARC' ? curve.startAngle : 0,
    sweep: curve.type === 'ARC' ? curve.sweepAngle : 2 * Math.PI,
  };
}
export function conicEvaluation(
  curve: ConicGeometry,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  const { a, b, start, sweep } = conicComponents(curve),
    angle = start + sweep * clampUnit(parameter);
  const anchored = curve.type === 'ARC' && curve.startPoint;
  const localAngle = sweep * clampUnit(parameter);
  const startA = add3(scale3(a, Math.cos(start)), scale3(b, Math.sin(start)));
  const startB = add3(scale3(a, -Math.sin(start)), scale3(b, Math.cos(start)));
  const point = anchored
    ? add3(
        anchored,
        add3(
          scale3(startA, -2 * Math.sin(localAngle / 2) ** 2),
          scale3(startB, Math.sin(localAngle)),
        ),
      )
    : add3(curve.center, add3(scale3(a, Math.cos(angle)), scale3(b, Math.sin(angle))));
  return {
    point,
    derivative: scale3(add3(scale3(a, -Math.sin(angle)), scale3(b, Math.cos(angle))), sweep),
  };
}
export function conicBounds(curve: ConicGeometry): GeometryBounds {
  const { a, b, start, sweep } = conicComponents(curve);
  const points = [conicEvaluation(curve, 0).point, conicEvaluation(curve, 1).point];
  for (const axis of ['x', 'y', 'z'] as const)
    for (const angle of [Math.atan2(b[axis], a[axis]), Math.atan2(b[axis], a[axis]) + Math.PI]) {
      const directed = normalizedAngle(sweep >= 0 ? angle - start : start - angle);
      if (directed <= Math.abs(sweep) + 1e-12)
        points.push(conicEvaluation(curve, directed / Math.abs(sweep)).point);
    }
  return { ...bounds3(points)!, kind: 'finite', quality: 'exact' };
}
export function linearEvaluation(
  curve: Extract<CurveGeometry, { type: 'LINE' | 'XLINE' | 'RAY' }>,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  if (curve.type === 'LINE')
    return {
      point: interpolate3(curve.start, curve.end, clampUnit(parameter)),
      derivative: subtract3(curve.end, curve.start),
    };
  const t = curve.type === 'RAY' ? Math.max(0, parameter) : parameter;
  return { point: add3(curve.basePoint, scale3(curve.direction, t)), derivative: curve.direction };
}
export function closestLinearParameter(
  curve: Extract<CurveGeometry, { type: 'LINE' | 'XLINE' | 'RAY' }>,
  point: Vec3,
): number {
  const start = curve.type === 'LINE' ? curve.start : curve.basePoint;
  const direction = curve.type === 'LINE' ? subtract3(curve.end, curve.start) : curve.direction;
  const squared = dot3(direction, direction),
    parameter = squared ? dot3(subtract3(point, start), direction) / squared : 0;
  return curve.type === 'LINE'
    ? clampUnit(parameter)
    : curve.type === 'RAY'
      ? Math.max(0, parameter)
      : parameter;
}
export function linearBounds(
  curve: Extract<CurveGeometry, { type: 'LINE' | 'XLINE' | 'RAY' }>,
): GeometryBounds {
  if (curve.type === 'LINE')
    return { ...bounds3([curve.start, curve.end])!, kind: 'finite', quality: 'exact' };
  const min = { ...curve.basePoint },
    max = { ...curve.basePoint };
  for (const axis of ['x', 'y', 'z'] as const) {
    const direction = curve.direction[axis];
    if (direction && (curve.type === 'XLINE' || direction < 0)) min[axis] = -Infinity;
    if (direction && (curve.type === 'XLINE' || direction > 0)) max[axis] = Infinity;
  }
  return { min, max, kind: 'unbounded', quality: 'exact' };
}
export function closestCircularParameter(curve: CircleGeometry | ArcGeometry, point: Vec3): number {
  const { a, b, start, sweep } = conicComponents(curve),
    relative = subtract3(point, curve.center);
  const angle = Math.atan2(dot3(relative, b), dot3(relative, a));
  const directed = normalizedAngle(sweep >= 0 ? angle - start : start - angle);
  if (curve.type === 'CIRCLE' || directed <= Math.abs(sweep)) return directed / Math.abs(sweep);
  const d0 = subtract3(conicEvaluation(curve, 0).point, point),
    d1 = subtract3(conicEvaluation(curve, 1).point, point);
  return dot3(d0, d0) <= dot3(d1, d1) ? 0 : 1;
}
