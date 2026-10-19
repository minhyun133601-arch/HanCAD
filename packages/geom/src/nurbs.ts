import { GeometryError } from './curve-types';
import type { SplineGeometry, Vec3 } from './curve-types';
import { fitSpline } from './fit-spline';
import { add3, clampUnit, scale3, subtract3 } from './vector3';

type Homogeneous = [number, number, number, number];
export function resolveSpline(source: SplineGeometry): SplineGeometry {
  const spline = source.controlPoints.length ? source : fitSpline(source);
  const { degree, controlPoints, knots, weights } = spline;
  if (!Number.isSafeInteger(degree) || degree < 1 || degree > 25 || controlPoints.length <= degree)
    throw new GeometryError('invalid-spline-degree');
  if (
    knots.length !== controlPoints.length + degree + 1 ||
    knots.some((k, i) => !Number.isFinite(k) || (i > 0 && k < knots[i - 1]!)) ||
    knots[degree]! >= knots[controlPoints.length]!
  )
    throw new GeometryError('invalid-spline-knots');
  if (
    weights.length &&
    (weights.length !== controlPoints.length || weights.some((w) => !Number.isFinite(w) || w <= 0))
  )
    throw new GeometryError('invalid-spline-weights');
  if (controlPoints.some((p) => ![p.x, p.y, p.z].every(Number.isFinite)))
    throw new GeometryError('invalid-spline-control-points');
  if (
    spline.kinkFitIndices !== undefined &&
    (!Array.isArray(spline.kinkFitIndices) ||
      new Set(spline.kinkFitIndices).size !== spline.kinkFitIndices.length ||
      spline.kinkFitIndices.some(
        (index) => !Number.isSafeInteger(index) || index < 0 || index >= spline.fitPoints.length,
      ))
  )
    throw new GeometryError('invalid-spline-kink-indices');
  return spline;
}
export function splineEvaluation(
  source: SplineGeometry,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  const spline = resolveSpline(source),
    t = clampUnit(parameter);
  const start = spline.knots[spline.degree]!,
    end = spline.knots[spline.controlPoints.length]!;
  const native = t === 1 ? end : start + (end - start) * t;
  const origin = spline.controlPoints[0]!;
  const maxWeight = spline.weights.reduce((maximum, value) => Math.max(maximum, value), 1);
  const controls: Homogeneous[] = spline.controlPoints.map((p, i) => {
    const relative = subtract3(p, origin),
      weight = (spline.weights[i] ?? 1) / maxWeight;
    return [relative.x * weight, relative.y * weight, relative.z * weight, weight];
  });
  const value = deBoor(controls, spline.knots, spline.degree, native);
  if (!value[3]) throw new GeometryError('spline-weight-underflow');
  const derivatives: Homogeneous[] = controls.slice(1).map((next, i) => {
    const denominator = spline.knots[i + spline.degree + 1]! - spline.knots[i + 1]!;
    const factor = denominator ? spline.degree / denominator : 0;
    return next.map((v, axis) => (v - controls[i]![axis]!) * factor) as Homogeneous;
  });
  const derivative = deBoor(derivatives, spline.knots.slice(1, -1), spline.degree - 1, native);
  const relative = { x: value[0] / value[3], y: value[1] / value[3], z: value[2] / value[3] };
  const dw = derivative[3] / value[3];
  return {
    point: add3(origin, relative),
    derivative: scale3(
      {
        x: derivative[0] / value[3] - relative.x * dw,
        y: derivative[1] / value[3] - relative.y * dw,
        z: derivative[2] / value[3] - relative.z * dw,
      },
      end - start,
    ),
  };
}
function deBoor(
  controls: readonly Homogeneous[],
  knots: readonly number[],
  degree: number,
  parameter: number,
): Homogeneous {
  let span = controls.length - 1;
  if (parameter < knots[controls.length]!) {
    span = degree;
    while (span < controls.length - 1 && parameter >= knots[span + 1]!) span++;
  }
  const work = Array.from(
    { length: degree + 1 },
    (_, j) => [...controls[span - degree + j]!] as Homogeneous,
  );
  for (let level = 1; level <= degree; level++)
    for (let j = degree; j >= level; j--) {
      const index = span - degree + j;
      const denominator = knots[index + degree - level + 1]! - knots[index]!;
      const alpha = denominator ? (parameter - knots[index]!) / denominator : 0;
      work[j] = work[j]!.map(
        (v, axis) => (1 - alpha) * work[j - 1]![axis]! + alpha * v,
      ) as Homogeneous;
    }
  return work[degree]!;
}
/** Nonzero knot spans prevent integration or closest-point searches from skipping sharp joins. */
export function splineBreakpoints(source: SplineGeometry): number[] {
  const spline = resolveSpline(source),
    start = spline.knots[spline.degree]!,
    end = spline.knots[spline.controlPoints.length]!;
  return [
    ...new Set(
      spline.knots
        .filter((value) => value >= start && value <= end)
        .map((value) => (value - start) / (end - start)),
    ),
  ];
}
