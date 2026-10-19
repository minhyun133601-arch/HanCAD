import {
  conicComponents,
  evaluateGeometry,
  geometryEvaluation,
  polylineSegments,
  splineBreakpoints,
  helixBreakpoints,
  transformGeometry,
} from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';

export interface CurveSample {
  parameter: number;
  point: Vec3;
}
export interface PreparedSnapCurve {
  geometry: CurveGeometry;
  samples: readonly CurveSample[];
}
export const squaredXY = (a: Pick<Vec3, 'x' | 'y'>, b: Pick<Vec3, 'x' | 'y'>): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const crossXY = (a: Pick<Vec3, 'x' | 'y'>, b: Pick<Vec3, 'x' | 'y'>): number =>
  a.x * b.y - a.y * b.x;

export function snapCurveParts(curve: CurveGeometry): CurveGeometry[] {
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE')
    return polylineSegments(curve).map((part) => part.geometry);
  if (curve.type === 'TRANSFORMED')
    return snapCurveParts(curve.source).map((part) => transformGeometry(part, curve.matrix));
  return [curve];
}
/** Natural extensions retain conic geometry rather than evaluating clamped arc parameters. */
export function extendedSnapCurves(curve: CurveGeometry): CurveGeometry[] {
  if (curve.type === 'LINE')
    return [
      {
        type: 'XLINE',
        basePoint: curve.start,
        direction: {
          x: curve.end.x - curve.start.x,
          y: curve.end.y - curve.start.y,
          z: curve.end.z - curve.start.z,
        },
      },
    ];
  if (curve.type === 'RAY') return [{ ...curve, type: 'XLINE' }];
  if (curve.type === 'ARC')
    return [
      {
        type: 'CIRCLE',
        center: curve.center,
        radius: curve.radius,
        normal: curve.normal,
        xAxis: curve.xAxis,
      },
    ];
  if (curve.type === 'ELLIPSE')
    return [{ ...curve, startParameter: 0, sweepParameter: Math.PI * 2 }];
  if (curve.type === 'SPLINE' && !curve.closed)
    return [
      curve,
      ...[0, 1].map((parameter) => {
        const end = geometryEvaluation(curve, parameter),
          sign = parameter === 0 ? -1 : 1;
        return {
          type: 'RAY' as const,
          basePoint: end.point,
          direction: {
            x: end.derivative.x * sign,
            y: end.derivative.y * sign,
            z: end.derivative.z * sign,
          },
        };
      }),
    ];
  return [curve];
}
export function isClosedSnapCurve(curve: CurveGeometry): boolean {
  if (curve.type === 'TRANSFORMED') return isClosedSnapCurve(curve.source);
  return (
    curve.type === 'CIRCLE' ||
    (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= Math.PI * 2 - 1e-10) ||
    ((curve.type === 'SPLINE' || curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') &&
      curve.closed)
  );
}
export function prepareSnapCurve(geometry: CurveGeometry): PreparedSnapCurve {
  if (
    geometry.type === 'LINE' ||
    geometry.type === 'POINT' ||
    geometry.type === 'RAY' ||
    geometry.type === 'XLINE'
  )
    return {
      geometry,
      samples: [0, 1].map((parameter) => ({
        parameter,
        point: evaluateGeometry(geometry, parameter),
      })),
    };
  const breaks =
    geometry.type === 'SPLINE'
      ? splineBreakpoints(geometry)
      : geometry.type === 'HELIX'
        ? helixBreakpoints(geometry)
        : [0, 1];
  const samples: CurveSample[] = [{ parameter: 0, point: evaluateGeometry(geometry, 0) }];
  for (let span = 1; span < breaks.length; span++) {
    const low = breaks[span - 1]!,
      high = breaks[span]!;
    const subdivisions = geometry.type === 'HELIX' ? 4 : 64;
    for (let step = 1; step <= subdivisions; step++) {
      const parameter = low + ((high - low) * step) / subdivisions;
      samples.push({ parameter, point: evaluateGeometry(geometry, parameter) });
    }
  }
  return { geometry, samples };
}
/** Point-to-curve inquiry is in the view plane, independent of source elevation. */
export function nearestSnapPoint(
  prepared: PreparedSnapCurve,
  point: Vec3,
  extend = false,
): CurveSample {
  const curve = prepared.geometry;
  if (curve.type === 'POINT') return { parameter: 0, point: curve.position };
  if (curve.type === 'LINE' || curve.type === 'XLINE' || curve.type === 'RAY') {
    const base = curve.type === 'LINE' ? curve.start : curve.basePoint;
    const direction =
      curve.type === 'LINE'
        ? { x: curve.end.x - base.x, y: curve.end.y - base.y, z: curve.end.z - base.z }
        : curve.direction;
    const square = direction.x ** 2 + direction.y ** 2;
    let parameter = square
      ? ((point.x - base.x) * direction.x + (point.y - base.y) * direction.y) / square
      : 0;
    if (!extend && curve.type !== 'XLINE') parameter = Math.max(0, parameter);
    if (!extend && curve.type === 'LINE') parameter = Math.min(1, parameter);
    return {
      parameter,
      point: {
        x: base.x + direction.x * parameter,
        y: base.y + direction.y * parameter,
        z: base.z + direction.z * parameter,
      },
    };
  }
  if ((curve.type === 'CIRCLE' || curve.type === 'ARC') && Math.abs(curve.normal.z) > 1 - 1e-12) {
    const { a, b, start, sweep } = conicComponents(curve),
      dx = point.x - curve.center.x,
      dy = point.y - curve.center.y;
    const angle = Math.atan2(dx * b.x + dy * b.y, dx * a.x + dy * a.y);
    let delta =
      (((Math.sign(sweep) * (angle - start)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (Math.abs(delta - 2 * Math.PI) < 1e-12) delta = 0;
    const parameter = delta / Math.abs(sweep);
    if (parameter <= 1 || extend || curve.type === 'CIRCLE')
      return { parameter, point: evaluateGeometry(curve, parameter) };
    const ends = [prepared.samples[0]!, prepared.samples.at(-1)!];
    return squaredXY(ends[0]!.point, point) <= squaredXY(ends[1]!.point, point)
      ? ends[0]!
      : ends[1]!;
  }
  let best = prepared.samples[0]!,
    index = 0;
  for (let i = 1; i < prepared.samples.length; i++)
    if (squaredXY(prepared.samples[i]!.point, point) < squaredXY(best.point, point)) {
      best = prepared.samples[i]!;
      index = i;
    }
  const low = prepared.samples[Math.max(0, index - 1)]!.parameter;
  const high = prepared.samples[Math.min(prepared.samples.length - 1, index + 1)]!.parameter;
  const parameter = minimizeParameter(
    (t) => squaredXY(evaluateGeometry(curve, t), point),
    low,
    high,
  );
  const refined = { parameter, point: evaluateGeometry(curve, parameter) };
  return squaredXY(refined.point, point) < squaredXY(best.point, point) ? refined : best;
}
export function minimizeParameter(
  f: (parameter: number) => number,
  start: number,
  end: number,
): number {
  let low = start,
    high = end;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = high - ratio * (high - low),
    b = low + ratio * (high - low),
    fa = f(a),
    fb = f(b);
  for (let i = 0; i < 48; i++) {
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
/** Finds transverse and repeated roots; stationary roots catch tangency without a sign change. */
export function snapScalarRoots(curve: PreparedSnapCurve, f: (t: number) => number): number[] {
  const roots: number[] = [];
  const add = (t: number): void => {
    if (t >= -1e-10 && t <= 1 + 1e-10 && !roots.some((other) => Math.abs(other - t) < 1e-7))
      roots.push(Math.max(0, Math.min(1, t)));
  };
  const values = curve.samples.map((sample) => f(sample.parameter));
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  const threshold = scale * 1e-10;
  if (values.every((value) => Math.abs(value) < threshold)) return [];
  for (let i = 0; i < curve.samples.length; i++) {
    const current = curve.samples[i]!,
      value = values[i]!;
    if (Math.abs(value) <= threshold) add(current.parameter);
    if (!i) continue;
    const previous = curve.samples[i - 1]!,
      before = values[i - 1]!;
    if (before * value < 0) {
      let low = previous.parameter,
        high = current.parameter,
        fl = before;
      for (let step = 0; step < 50; step++) {
        const mid = (low + high) / 2,
          fm = f(mid);
        if (fl * fm <= 0) high = mid;
        else {
          low = mid;
          fl = fm;
        }
      }
      add((low + high) / 2);
    }
    if (
      i < curve.samples.length - 1 &&
      Math.abs(value) <= Math.abs(before) &&
      Math.abs(value) <= Math.abs(values[i + 1]!)
    ) {
      const t = minimizeParameter(
        (t) => f(t) ** 2,
        previous.parameter,
        curve.samples[i + 1]!.parameter,
      );
      if (Math.abs(f(t)) <= threshold) add(t);
    }
  }
  return roots;
}
export function normalSnapPoints(
  prepared: PreparedSnapCurve,
  base: Vec3,
  kind: 'perpendicular' | 'tangent',
  near?: Vec3,
): CurveSample[] {
  const curve = prepared.geometry;
  if (
    kind === 'perpendicular' &&
    (curve.type === 'CIRCLE' || curve.type === 'ARC') &&
    Math.abs(curve.normal.z) > 1 - 1e-12 &&
    squaredXY(base, curve.center) < 1e-20
  )
    return [nearestSnapPoint(prepared, near ?? base)];
  if (curve.type === 'LINE' || curve.type === 'XLINE' || curve.type === 'RAY') {
    if (kind === 'tangent') return [];
    return [nearestSnapPoint(prepared, base, true)];
  }
  const roots = snapScalarRoots(prepared, (t) => {
    const { point, derivative } = geometryEvaluation(curve, t),
      delta = { x: point.x - base.x, y: point.y - base.y };
    return kind === 'tangent'
      ? crossXY(delta, derivative)
      : delta.x * derivative.x + delta.y * derivative.y;
  });
  return roots.map((parameter) => ({ parameter, point: evaluateGeometry(curve, parameter) }));
}
