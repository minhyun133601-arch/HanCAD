import {
  closestGeometryPoint,
  geometryEvaluation,
  splineBreakpoints,
  type CurveGeometry,
  type SplineGeometry,
  type Vec3,
} from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { wcs } from './draw-curve-helpers';
import { offsetNearestDistance } from './modify-offset-nearest';

type Fitter = (
  curve: CurveGeometry,
  point: CadPoint,
  distance: number,
  interval?: readonly [number, number],
) => SplineGeometry;
const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function concatenate(a: SplineGeometry, b: SplineGeometry): SplineGeometry {
  const controls = [...a.controlPoints, ...b.controlPoints.slice(1)];
  return {
    ...a,
    controlPoints: controls,
    weights: controls.map(() => 1),
    knots: [
      ...a.knots.slice(0, -4).map((k) => k / 2),
      0.5,
      0.5,
      0.5,
      ...b.knots.slice(4).map((k) => 0.5 + k / 2),
    ],
    closed: false,
  };
}
/** Remove invalid cusp loops before fitting, rather than returning a self-intersecting spline.
 * The clearance criterion is the same geometric criterion used by Cavalier's offset slicing. */
export function trimmedSplineOffsets(
  curve: CurveGeometry,
  point: CadPoint,
  distance: number,
  fit: Fitter,
): SplineGeometry[] {
  try {
    return [fit(curve, point, distance)];
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('curvature cusp')) throw error;
  }
  const pick = wcs(point),
    near = closestGeometryPoint(curve, pick),
    e = geometryEvaluation(curve, near.parameter),
    v = e.derivative,
    length = Math.hypot(v.x, v.y),
    side = (-v.y * (pick.x - e.point.x) + v.x * (pick.y - e.point.y)) / length,
    offset = distance < 0 ? side : Math.sign(side) * distance;
  const nearestDistance = offsetNearestDistance(
      curve,
      Math.max(1e-5, Math.min(1e-3, Math.abs(offset) * 1e-5)),
    ),
    cache = new Map<number, boolean>();
  const valid = (t: number): boolean => {
    const known = cache.get(t);
    if (known !== undefined) return known;
    if (cache.size >= 4096) throw new Error('Offset spline topology limit.');
    const value = geometryEvaluation(curve, t),
      d = value.derivative,
      speed = Math.hypot(d.x, d.y),
      h = 1e-5,
      lo = Math.max(0, t - h),
      hi = Math.min(1, t + h),
      a = geometryEvaluation(curve, lo).derivative,
      b = geometryEvaluation(curve, hi).derivative;
    if (speed < 1e-12) return false;
    const curvature = (d.x * (b.y - a.y) - d.y * (b.x - a.x)) / ((hi - lo) * speed ** 3);
    if (1 - offset * curvature <= 1e-8) return false;
    const shifted = {
      x: value.point.x - (offset * d.y) / speed,
      y: value.point.y + (offset * d.x) / speed,
      z: value.point.z,
    };
    const result = nearestDistance(shifted) >= Math.abs(offset) - 2e-8;
    cache.set(t, result);
    return result;
  };
  const breaks = curve.type === 'SPLINE' ? splineBreakpoints(curve) : [0, 0.25, 0.5, 0.75, 1],
    samples: number[] = [];
  if (breaks.length > 129) throw new Error('Offset spline topology limit.');
  const count = Math.max(4, Math.min(64, Math.floor(512 / (breaks.length - 1))));
  for (let i = 1; i < breaks.length; i++)
    for (let j = 0; j < count; j++)
      samples.push(breaks[i - 1]! + ((breaks[i]! - breaks[i - 1]!) * j) / count);
  samples.push(1);
  const intervals: [number, number][] = [],
    transition = (a: number, b: number, atA: boolean): number => {
      for (let i = 0; i < 40; i++) {
        const mid = (a + b) / 2;
        if (valid(mid) === atA) a = mid;
        else b = mid;
      }
      return (a + b) / 2;
    };
  let previous = samples[0]!,
    wasValid = valid(previous),
    start = wasValid ? previous : undefined;
  for (const t of samples.slice(1)) {
    const nowValid = valid(t);
    if (nowValid !== wasValid) {
      const boundary = transition(previous, t, wasValid);
      if (nowValid) start = boundary;
      else if (start !== undefined) {
        intervals.push([start, boundary]);
        start = undefined;
      }
    }
    previous = t;
    wasValid = nowValid;
  }
  if (start !== undefined) intervals.push([start, 1]);
  const pieces = intervals
    .filter(([a, b]) => b - a > 1e-10)
    .map((interval) => fit(curve, point, distance, interval));
  const connected: SplineGeometry[] = [];
  for (const piece of pieces) {
    const prior = connected.at(-1);
    if (prior && distance3(prior.controlPoints.at(-1)!, piece.controlPoints[0]!) <= 1e-6)
      connected[connected.length - 1] = concatenate(prior, piece);
    else connected.push(piece);
  }
  if (
    connected.length > 1 &&
    distance3(connected.at(-1)!.controlPoints.at(-1)!, connected[0]!.controlPoints[0]!) <= 1e-6
  ) {
    const last = connected.pop()!;
    connected[0] = concatenate(last, connected[0]!);
  }
  return connected.map((piece) => {
    const controls = [...piece.controlPoints],
      closed = distance3(controls[0]!, controls.at(-1)!) <= 1e-6;
    if (closed) controls[controls.length - 1] = controls[0]!;
    return { ...piece, controlPoints: controls, closed };
  });
}
