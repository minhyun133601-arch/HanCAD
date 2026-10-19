import {
  evaluateGeometry,
  geometryEvaluation,
  resolveSpline,
  splineBreakpoints,
} from '@hancad/geom';
import type { CurveGeometry, SplineGeometry, Vec3 } from '@hancad/geom';

type HPoint = [number, number, number, number];
const blend = (a: HPoint, b: HPoint, t: number): HPoint =>
  a.map((v, i) => v * (1 - t) + b[i]! * t) as HPoint;
const homogeneous = (s: SplineGeometry): HPoint[] =>
  s.controlPoints.map((p, i) => {
    const w = s.weights[i] ?? 1;
    return [p.x * w, p.y * w, p.z * w, w];
  });
function fromH(
  source: SplineGeometry,
  points: readonly HPoint[],
  knots: number[],
  degree = source.degree,
): SplineGeometry {
  const result: SplineGeometry = {
    ...source,
    degree,
    knots,
    controlPoints: points.map(([x, y, z, w]) => ({ x: x / w, y: y / w, z: z / w })),
    weights: points.map((p) => p[3]),
    fitPoints: [],
    closed: false,
    periodic: false,
  };
  delete result.startTangent;
  delete result.endTangent;
  delete result.kinkFitIndices;
  return result;
}
/** Boehm knot insertion preserves rational geometry, including unequal weights. */
export function insertSplineKnot(source: SplineGeometry, parameter: number): SplineGeometry {
  const s = resolveSpline(source),
    p = s.degree,
    n = s.controlPoints.length - 1;
  const knots = [...s.knots],
    low = knots[p]!,
    high = knots[n + 1]!;
  const u = low + (high - low) * Math.max(0, Math.min(1, parameter));
  const multiplicity = knots.filter(
    (k) => Math.abs(k - u) <= 1e-13 * Math.max(1, Math.abs(high - low)),
  ).length;
  if (multiplicity >= p + 1) return structuredClone(s);
  let k = u === high && multiplicity < p + 1 ? n + 1 : n;
  if (u < high) {
    k = p;
    while (k < n && u >= knots[k + 1]!) k++;
  }
  const controls = homogeneous(s),
    next: HPoint[] = [];
  for (let i = 0; i <= k - p; i++) next[i] = controls[i]!;
  for (let i = k - multiplicity; i <= n; i++) next[i + 1] = controls[i]!;
  for (let i = k - p + 1; i <= k - multiplicity; i++) {
    const denominator = knots[i + p]! - knots[i]!;
    next[i] = blend(
      controls[i - 1]!,
      controls[i]!,
      denominator ? (u - knots[i]!) / denominator : 0,
    );
  }
  knots.splice(k + 1, 0, u);
  return fromH(s, next, knots);
}
export function splitSpline(
  source: SplineGeometry,
  parameter: number,
): [SplineGeometry, SplineGeometry] {
  let s = resolveSpline(source);
  const p = s.degree,
    low = s.knots[p]!,
    high = s.knots[s.controlPoints.length]!;
  const u = low + (high - low) * parameter;
  while (s.knots.filter((k) => Math.abs(k - u) < 1e-12 * Math.max(1, high - low)).length < p)
    s = insertSplineKnot(s, parameter);
  const first = s.knots.findIndex((k) => Math.abs(k - u) < 1e-12 * Math.max(1, high - low));
  const index = first - 1,
    controls = homogeneous(s);
  return [
    fromH(s, controls.slice(0, index + 1), [...s.knots.slice(0, first + p), u]),
    fromH(s, controls.slice(index), [u, ...s.knots.slice(first)]),
  ];
}
export function sliceSpline(source: SplineGeometry, from: number, to: number): SplineGeometry {
  let result = clampSpline(source);
  if (to < 1 - 1e-12) result = splitSpline(result, to)[0];
  if (from > 1e-12) result = splitSpline(result, from / to)[1];
  return result;
}
/** Discard exterior periodic spans after inserting the active domain endpoints. */
export function clampSpline(source: SplineGeometry): SplineGeometry {
  let result = resolveSpline(source);
  const degree = result.degree,
    low = result.knots[degree]!,
    high = result.knots[result.controlPoints.length]!;
  while (result.knots.filter((k) => k === low).length < degree + 1)
    result = insertSplineKnot(result, 0);
  const lowIndex = result.knots.indexOf(low);
  if (lowIndex)
    result = fromH(result, homogeneous(result).slice(lowIndex), [...result.knots.slice(lowIndex)]);
  while (result.knots.filter((k) => k === high).length < degree + 1)
    result = insertSplineKnot(result, 1);
  const last = result.knots.lastIndexOf(high);
  return fromH(result, homogeneous(result).slice(0, last - degree), [
    ...result.knots.slice(0, last + 1),
  ]);
}
/** Extends the first/last polynomial knot span, preserving the original rational equation. */
export function extendSpline(
  source: SplineGeometry,
  parameter: number,
): SplineGeometry | undefined {
  if (parameter >= 0 && parameter <= 1) return source;
  const breaks = splineBreakpoints(source),
    start = parameter < 0;
  const lo = start ? 0 : breaks.at(-2)!,
    hi = start ? breaks[1]! : 1;
  const piece = sliceSpline(source, lo, hi);
  let controls = homogeneous(piece);
  if (start) controls.reverse();
  const ratio = start ? (hi - parameter) / hi : (parameter - lo) / (1 - lo);
  const next: HPoint[] = [controls[0]!];
  while (controls.length > 1) {
    controls = controls.slice(1).map((b, i) => blend(controls[i]!, b, ratio));
    next.push(controls[0]!);
  }
  if (start) next.reverse();
  if (next.some((p) => p[3] <= 0)) return;
  const extended = fromH(piece, next, [
    ...Array<number>(piece.degree + 1).fill(0),
    ...Array<number>(piece.degree + 1).fill(1),
  ]);
  if (start) return hi < 1 ? concatenateSplines([extended, sliceSpline(source, hi, 1)]) : extended;
  return lo > 0 ? concatenateSplines([sliceSpline(source, 0, lo), extended]) : extended;
}
/** Independent Bezier elevation keeps the curve exact, with C0 knot joins. */
export function elevateSpline(source: SplineGeometry, degree: number): SplineGeometry {
  const pieces = splineBreakpoints(source)
    .slice(1)
    .map((end, i) => sliceSpline(source, splineBreakpoints(source)[i]!, end));
  const elevated = pieces.map((piece) => {
    let points = homogeneous(piece),
      p = piece.degree;
    while (p < degree) {
      points = [
        points[0]!,
        ...Array.from({ length: p }, (_, i) =>
          blend(points[i + 1]!, points[i]!, (i + 1) / (p + 1)),
        ),
        points.at(-1)!,
      ];
      p++;
    }
    return fromH(
      piece,
      points,
      [...Array<number>(p + 1).fill(0), ...Array<number>(p + 1).fill(1)],
      p,
    );
  });
  return concatenateSplines(elevated);
}
export function concatenateSplines(sources: readonly SplineGeometry[]): SplineGeometry {
  const degree = Math.max(...sources.map((s) => s.degree));
  const parts = sources.map((source) =>
    source.degree === degree ? clampSpline(source) : elevateSpline(source, degree),
  );
  const points: HPoint[] = [],
    knots: number[] = [];
  parts.forEach((part, i) => {
    const lo = part.knots[degree]!,
      hi = part.knots[part.controlPoints.length]!;
    const normalized = part.knots.map((k) => i + (k - lo) / (hi - lo));
    const controls = homogeneous(part);
    if (!i) {
      points.push(...controls);
      knots.push(...normalized);
    } else {
      const ratio = points.at(-1)![3] / controls[0]![3];
      points.push(...controls.slice(1).map((p) => p.map((n) => n * ratio) as HPoint));
      knots.pop();
      knots.push(...normalized.slice(degree + 1));
    }
  });
  return fromH(parts[0]!, points, knots, degree);
}
export function curveSpline(curve: CurveGeometry): SplineGeometry | undefined {
  if (curve.type === 'SPLINE') return resolveSpline(curve);
  const blank: SplineGeometry = {
    type: 'SPLINE',
    degree: 1,
    knots: [0, 0, 1, 1],
    controlPoints: [],
    weights: [],
    fitPoints: [],
    closed: false,
    periodic: false,
    fitTolerance: 0,
    knotParameterization: 'chord',
  };
  if (curve.type === 'LINE')
    return { ...blank, controlPoints: [curve.start, curve.end], weights: [1, 1] };
  if (curve.type === 'HELIX') {
    const count = Math.min(4096, Math.max(16, Math.ceil(Math.abs(curve.turns) * 32)));
    const pieces = Array.from({ length: count }, (_, i): SplineGeometry => {
      const a = geometryEvaluation(curve, i / count),
        b = geometryEvaluation(curve, (i + 1) / count);
      const tangent = (p: Vec3, d: Vec3, sign: number): Vec3 => ({
        x: p.x + (sign * d.x) / (3 * count),
        y: p.y + (sign * d.y) / (3 * count),
        z: p.z + (sign * d.z) / (3 * count),
      });
      return {
        ...blank,
        degree: 3,
        knots: [0, 0, 0, 0, 1, 1, 1, 1],
        weights: [1, 1, 1, 1],
        controlPoints: [
          a.point,
          tangent(a.point, a.derivative, 1),
          tangent(b.point, b.derivative, -1),
          b.point,
        ],
      };
    });
    return concatenateSplines(pieces);
  }
  if (!['ARC', 'CIRCLE', 'ELLIPSE'].includes(curve.type)) return undefined;
  const sweep =
    curve.type === 'ARC'
      ? curve.sweepAngle
      : curve.type === 'ELLIPSE'
        ? curve.sweepParameter
        : Math.PI * 2;
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const pieces: SplineGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = evaluateGeometry(curve, i / count),
      b = evaluateGeometry(curve, (i + 1) / count);
    const midpoint = evaluateGeometry(curve, (i + 0.5) / count),
      weight = Math.cos(sweep / count / 2);
    const center = 'center' in curve ? curve.center : { x: 0, y: 0, z: 0 };
    const control: Vec3 = {
      x: center.x + (midpoint.x - center.x) / weight,
      y: center.y + (midpoint.y - center.y) / weight,
      z: center.z + (midpoint.z - center.z) / weight,
    };
    pieces.push({
      ...blank,
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [a, control, b],
      weights: [1, weight, 1],
    });
  }
  return concatenateSplines(pieces);
}
