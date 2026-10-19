import { GeometryError } from './curve-types';
import { circularSegmentArea } from './geometry';
import type { ClosestGeometryPoint, CurveGeometry, GeometryBounds, Vec3 } from './curve-types';
import {
  closestCircularParameter,
  closestLinearParameter,
  conicBounds,
  conicEvaluation,
  linearBounds,
  linearEvaluation,
} from './analytic-curves';
import {
  planarNormal,
  polylineArea3,
  polylineBounds3,
  polylineEvaluation3,
  polylineLength3,
  polylineSegments,
} from './polyline3';
import { resolveSpline, splineBreakpoints, splineEvaluation } from './nurbs';
import { helixBounds, helixBreakpoints, helixEvaluation } from './helix';
import {
  bounds3,
  cross3,
  distance3,
  dot3,
  magnitude3,
  subtract3,
  transformPoint3,
  transformVector3,
} from './vector3';

export function evaluateGeometry(curve: CurveGeometry, parameter: number): Vec3 {
  return geometryEvaluation(curve, parameter).point;
}
export function geometryEvaluation(
  curve: CurveGeometry,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  if (!Number.isFinite(parameter)) throw new GeometryError('invalid-parameter');
  switch (curve.type) {
    case 'POINT':
      return { point: { ...curve.position }, derivative: { x: 0, y: 0, z: 0 } };
    case 'LINE':
    case 'XLINE':
    case 'RAY':
      return linearEvaluation(curve, parameter);
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
      return conicEvaluation(curve, parameter);
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return polylineEvaluation3(curve, parameter);
    case 'SPLINE':
      return splineEvaluation(curve, parameter);
    case 'HELIX':
      return helixEvaluation(curve, parameter);
    case 'TRANSFORMED': {
      const result = geometryEvaluation(curve.source, parameter);
      return {
        point: transformPoint3(curve.matrix, result.point),
        derivative: transformVector3(curve.matrix, result.derivative),
      };
    }
  }
}
export function geometryBounds(curve: CurveGeometry): GeometryBounds {
  switch (curve.type) {
    case 'POINT':
      return {
        min: { ...curve.position },
        max: { ...curve.position },
        kind: 'finite',
        quality: 'exact',
      };
    case 'LINE':
    case 'XLINE':
    case 'RAY':
      return linearBounds(curve);
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
      return conicBounds(curve);
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return polylineBounds3(curve);
    case 'SPLINE':
      return {
        ...bounds3(resolveSpline(curve).controlPoints)!,
        kind: 'finite',
        quality: 'conservative',
      };
    case 'HELIX':
      return helixBounds(curve);
    case 'TRANSFORMED': {
      const source = geometryBounds(curve.source);
      if (source.kind === 'unbounded') throw new GeometryError('unbounded-transformed-wrapper');
      const corners: Vec3[] = [];
      for (const x of [source.min.x, source.max.x])
        for (const y of [source.min.y, source.max.y])
          for (const z of [source.min.z, source.max.z])
            corners.push(transformPoint3(curve.matrix, { x, y, z }));
      return { ...bounds3(corners)!, kind: 'finite', quality: 'conservative' };
    }
  }
}
export function geometryLength(curve: CurveGeometry, tolerance = 1e-9): number {
  switch (curve.type) {
    case 'POINT':
      return 0;
    case 'LINE':
      return distance3(curve.start, curve.end);
    case 'XLINE':
    case 'RAY':
      return Infinity;
    case 'CIRCLE':
      return 2 * Math.PI * curve.radius;
    case 'ARC':
      return Math.abs(curve.sweepAngle * curve.radius);
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return polylineLength3(curve);
    default:
      return integrateCurve(
        curve,
        (t) => magnitude3(geometryEvaluation(curve, t).derivative),
        tolerance,
      );
  }
}
/** Unsupported/nonplanar area is undefined; inquiry closes finite open curves with a straight chord. */
export function geometryArea(curve: CurveGeometry, tolerance = 1e-9): number | undefined {
  switch (curve.type) {
    case 'POINT':
    case 'LINE':
    case 'XLINE':
    case 'RAY':
      return undefined;
    case 'CIRCLE':
      return Math.PI * curve.radius * curve.radius;
    case 'ARC':
      return Math.abs(circularSegmentArea(curve.radius, curve.sweepAngle));
    case 'ELLIPSE':
      return Math.abs(
        (magnitude3(cross3(curve.majorAxis, curve.minorAxis)) *
          (curve.sweepParameter - Math.sin(curve.sweepParameter))) /
          2,
      );
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return polylineArea3(curve);
    case 'SPLINE': {
      const normal = planarNormal(resolveSpline(curve).controlPoints);
      return normal ? integratedArea(curve, normal, tolerance) : undefined;
    }
    case 'HELIX':
      return curve.height === 0 ? integratedArea(curve, curve.normal, tolerance) : undefined;
    case 'TRANSFORMED': {
      const points = Array.from({ length: 33 }, (_, index) => evaluateGeometry(curve, index / 32));
      const normal = planarNormal(points);
      return geometryArea(curve.source, tolerance) === undefined || !normal
        ? undefined
        : integratedArea(curve, normal, tolerance);
    }
  }
}
function integratedArea(curve: CurveGeometry, normal: Vec3, tolerance: number): number {
  const origin = evaluateGeometry(curve, 0);
  return Math.abs(
    integrateCurve(
      curve,
      (t) => {
        const { point, derivative } = geometryEvaluation(curve, t);
        return dot3(cross3(subtract3(point, origin), derivative), normal) / 2;
      },
      tolerance,
    ),
  );
}
export function closestGeometryPoint(curve: CurveGeometry, point: Vec3): ClosestGeometryPoint {
  const result = (
    parameter: number,
    quality: ClosestGeometryPoint['quality'],
  ): ClosestGeometryPoint => {
    const closest = evaluateGeometry(curve, parameter);
    return { point: closest, parameter, distance: distance3(point, closest), quality };
  };
  if (curve.type === 'POINT') return result(0, 'exact');
  if (curve.type === 'LINE' || curve.type === 'RAY' || curve.type === 'XLINE')
    return result(closestLinearParameter(curve, point), 'exact');
  if (curve.type === 'CIRCLE' || curve.type === 'ARC')
    return result(closestCircularParameter(curve, point), 'exact');
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const segments = polylineSegments(curve);
    let best = result(0, 'exact');
    segments.forEach((segment, index) => {
      const candidate = closestGeometryPoint(segment.geometry, point);
      if (candidate.distance < best.distance)
        best = { ...candidate, parameter: (index + candidate.parameter) / segments.length };
    });
    return best;
  }
  const breaks = geometryBreakpoints(curve);
  let best = result(0, 'numerical');
  const squaredDistance = (t: number) => {
    const delta = subtract3(evaluateGeometry(curve, t), point);
    return dot3(delta, delta);
  };
  for (let span = 1; span < breaks.length; span++) {
    const start = breaks[span - 1]!,
      end = breaks[span]!;
    // Search every subinterval rather than assuming one minimum for an entire NURBS knot span.
    for (let i = 0; i < 32; i++) {
      const low = start + ((end - start) * i) / 32,
        high = start + ((end - start) * (i + 1)) / 32;
      const t = minimize(squaredDistance, low, high);
      for (const parameter of [low, t, high]) {
        const candidate = result(parameter, 'numerical');
        if (candidate.distance < best.distance) best = candidate;
      }
    }
  }
  return best;
}
function minimize(f: (t: number) => number, initialLow: number, initialHigh: number): number {
  let low = initialLow,
    high = initialHigh;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = high - ratio * (high - low),
    b = low + ratio * (high - low),
    fa = f(a),
    fb = f(b);
  for (let step = 0; step < 48; step++) {
    if (fa <= fb) {
      high = b;
      b = a;
      fb = fa;
      a = high - ratio * (high - low);
      fa = f(a);
    } else {
      low = a;
      a = b;
      fa = fb;
      b = low + ratio * (high - low);
      fb = f(b);
    }
  }
  return (low + high) / 2;
}
function geometryBreakpoints(curve: CurveGeometry): number[] {
  if (curve.type === 'SPLINE') return splineBreakpoints(curve);
  if (curve.type === 'HELIX') return helixBreakpoints(curve);
  if (curve.type === 'TRANSFORMED') return geometryBreakpoints(curve.source);
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const count = polylineSegments(curve).length;
    return Array.from({ length: count + 1 }, (_, i) => i / count);
  }
  return [0, 0.25, 0.5, 0.75, 1];
}
function integrateCurve(curve: CurveGeometry, f: (t: number) => number, tolerance: number): number {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new GeometryError('invalid-tolerance');
  const breaks = geometryBreakpoints(curve);
  let value = 0;
  for (let i = 1; i < breaks.length; i++)
    value += integrate(f, breaks[i - 1]!, breaks[i]!, tolerance / (breaks.length - 1), 0);
  return value;
}
const nodes5 = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const weights5 = [
  0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891,
  0.2369268850561891,
];
function integrate(
  f: (t: number) => number,
  low: number,
  high: number,
  tolerance: number,
  depth: number,
): number {
  const half = (high - low) / 2,
    center = low + half;
  const precise =
    half * nodes5.reduce((sum, node, i) => sum + weights5[i]! * f(center + half * node), 0);
  const simple =
    half *
    ((8 / 9) * f(center) +
      (5 / 9) * (f(center - half * Math.sqrt(3 / 5)) + f(center + half * Math.sqrt(3 / 5))));
  if (depth >= 18 || Math.abs(precise - simple) <= tolerance * (1 + Math.abs(precise)))
    return precise;
  return (
    integrate(f, low, center, tolerance / 2, depth + 1) +
    integrate(f, center, high, tolerance / 2, depth + 1)
  );
}
