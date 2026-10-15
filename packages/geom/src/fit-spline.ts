import { GeometryError } from './curve-types';
import type { SplineGeometry, Vec3 } from './curve-types';
import { add3, distance3, magnitude3, scale3, subtract3 } from './vector3';

/** Exact cubic fit interpolation, with optional derivative magnitudes and periodic C2 closure. */
export function fitSpline(source: SplineGeometry): SplineGeometry {
  const points = [...source.fitPoints];
  if (points.length < 2) throw new GeometryError('insufficient-fit-points');
  if ((source.closed || source.periodic) && distance3(points[0]!, points.at(-1)!) !== 0)
    points.push(points[0]!);
  const intervals = points.slice(1).map((p, i) => {
    const distance = distance3(points[i]!, p);
    if (!distance) throw new GeometryError('coincident-fit-points');
    return source.knotParameterization === 'uniform'
      ? 1
      : source.knotParameterization === 'centripetal'
        ? Math.sqrt(distance)
        : distance;
  });
  const total = intervals.reduce((sum, h) => sum + h, 0);
  const h = intervals.map((value) => value / total),
    parameters = [0];
  for (const step of h) parameters.push(parameters.at(-1)! + step);
  parameters[parameters.length - 1] = 1;
  const second = secondDerivatives(points, h, source);
  const controls: Vec3[] = [points[0]!];
  for (let i = 0; i < h.length; i++) {
    const start = points[i]!,
      end = points[i + 1]!,
      step = h[i]!;
    const delta = scale3(subtract3(end, start), 1 / step);
    const d0 = subtract3(delta, scale3(add3(scale3(second[i]!, 2), second[i + 1]!), step / 6));
    const d1 = add3(delta, scale3(add3(second[i]!, scale3(second[i + 1]!, 2)), step / 6));
    if (source.periodic) {
      if (i === 0) verifyPeriodicTangent(d0, source.startTangent);
      if (i === h.length - 1) verifyPeriodicTangent(d1, source.endTangent);
    }
    controls.push(add3(start, scale3(d0, step / 3)), subtract3(end, scale3(d1, step / 3)), end);
  }
  const knots = [0, 0, 0, 0];
  for (const parameter of parameters.slice(1, -1)) knots.push(parameter, parameter, parameter);
  knots.push(1, 1, 1, 1);
  return { ...source, degree: 3, knots, controlPoints: controls, weights: controls.map(() => 1) };
}
function verifyPeriodicTangent(actual: Vec3, supplied: Vec3 | undefined): void {
  if (!supplied) return;
  // Fixed fit parameters uniquely determine the periodic cubic; extra constraints must agree.
  const roundoff = 64 * Number.EPSILON * Math.max(1, magnitude3(actual), magnitude3(supplied));
  if (distance3(actual, supplied) > roundoff)
    throw new GeometryError('inconsistent-periodic-fit-tangents');
}
function secondDerivatives(
  points: readonly Vec3[],
  h: readonly number[],
  source: SplineGeometry,
): Vec3[] {
  const n = points.length - 1,
    size = source.periodic ? n : n + 1;
  if (source.periodic && size < 3) throw new GeometryError('insufficient-periodic-fit-points');
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhs: Vec3[] = Array.from({ length: size }, () => ({ x: 0, y: 0, z: 0 }));
  for (let i = source.periodic ? 0 : 1; i < (source.periodic ? n : n); i++) {
    const before = (i + n - 1) % n,
      after = (i + 1) % n;
    const hp = h[before]!,
      hn = h[i]!;
    matrix[i]![before] = hp;
    matrix[i]![i] = 2 * (hp + hn);
    matrix[i]![source.periodic ? after : i + 1] = hn;
    const previousPoint = points[i === 0 ? n - 1 : i - 1]!;
    rhs[i] = scale3(
      subtract3(
        scale3(subtract3(points[i + 1]!, points[i]!), 1 / hn),
        scale3(subtract3(points[i]!, previousPoint), 1 / hp),
      ),
      6,
    );
  }
  if (!source.periodic) {
    matrix[0]![0] = 1;
    matrix[n]![n] = 1;
    if (source.startTangent) {
      matrix[0]![0] = 2 * h[0]!;
      matrix[0]![1] = h[0]!;
      rhs[0] = scale3(
        subtract3(scale3(subtract3(points[1]!, points[0]!), 1 / h[0]!), source.startTangent),
        6,
      );
    }
    if (source.endTangent) {
      matrix[n]![n - 1] = h[n - 1]!;
      matrix[n]![n] = 2 * h[n - 1]!;
      rhs[n] = scale3(
        subtract3(source.endTangent, scale3(subtract3(points[n]!, points[n - 1]!), 1 / h[n - 1]!)),
        6,
      );
    }
  }
  const result = solve(matrix, rhs);
  return source.periodic ? [...result, result[0]!] : result;
}
function solve(matrix: number[][], values: Vec3[]): Vec3[] {
  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let row = i + 1; row < n; row++)
      if (Math.abs(matrix[row]![i]!) > Math.abs(matrix[pivot]![i]!)) pivot = row;
    if (Math.abs(matrix[pivot]![i]!) < 1e-14) throw new GeometryError('singular-fit-data');
    [matrix[i], matrix[pivot]] = [matrix[pivot]!, matrix[i]!];
    [values[i], values[pivot]] = [values[pivot]!, values[i]!];
    const divisor = matrix[i]![i]!;
    for (let col = i; col < n; col++) matrix[i]![col] = matrix[i]![col]! / divisor;
    values[i] = scale3(values[i]!, 1 / divisor);
    for (let row = 0; row < n; row++) {
      if (row === i) continue;
      const factor = matrix[row]![i]!;
      for (let col = i; col < n; col++)
        matrix[row]![col] = matrix[row]![col]! - factor * matrix[i]![col]!;
      values[row] = subtract3(values[row]!, scale3(values[i]!, factor));
    }
  }
  return values;
}
