import { distance3, fitSpline } from '@hancad/geom';
import type { SplineGeometry, Vec3 } from '@hancad/geom';
import { concatenateSplines, sliceSpline } from './modify-spline-geometry';

export function purgeSplineFit(source: SplineGeometry): SplineGeometry {
  const result = { ...source, fitPoints: [] };
  delete result.kinkFitIndices;
  delete result.startTangent;
  delete result.endTangent;
  return result;
}
function pointParameter(
  points: readonly Vec3[],
  index: number,
  method: SplineGeometry['knotParameterization'],
): number {
  const intervals = points
    .slice(1)
    .map((p, i) =>
      method === 'uniform'
        ? 1
        : method === 'centripetal'
          ? Math.sqrt(distance3(p, points[i]!))
          : distance3(p, points[i]!),
    );
  return (
    intervals.slice(0, index).reduce((sum, n) => sum + n, 0) /
    intervals.reduce((sum, n) => sum + n, 0)
  );
}
/** Natural cubic pieces share each kink position while keeping independent endpoint derivatives. */
export function refitEditSpline(source: SplineGeometry): SplineGeometry {
  const indices = [...new Set(source.kinkFitIndices ?? [])].sort((a, b) => a - b);
  if (!indices.length) return fitSpline(source);
  const original = [...source.fitPoints];
  if (source.closed && original.length > 1 && distance3(original[0]!, original.at(-1)!) <= 1e-12)
    original.pop();
  const count = original.length,
    pivot = source.closed ? indices[0]! : 0;
  const points = source.closed
    ? [...original.slice(pivot), ...original.slice(0, pivot), original[pivot]!]
    : original;
  const boundaries = [
    ...new Set([
      0,
      ...indices.map((i) => (source.closed ? (i - pivot + count) % count : i)),
      points.length - 1,
      ...(source.closed && source.startTangent && pivot ? [count - pivot] : []),
    ]),
  ].sort((a, b) => a - b);
  const pieces: SplineGeometry[] = [];
  let originalStartParameter = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const from = boundaries[i - 1]!,
      to = boundaries[i]!;
    if (to <= from) continue;
    const part: SplineGeometry = {
      ...source,
      fitPoints: points.slice(from, to + 1),
      controlPoints: [],
      weights: [],
      knots: [],
      closed: false,
      periodic: false,
    };
    delete part.kinkFitIndices;
    delete part.startTangent;
    delete part.endTangent;
    if (!source.closed) {
      if (!from && source.startTangent) part.startTangent = source.startTangent;
      if (to === points.length - 1 && source.endTangent) part.endTangent = source.endTangent;
    } else if (source.startTangent) {
      const originalZero = (count - pivot) % count;
      if (from === originalZero) part.startTangent = source.startTangent;
      if (to === originalZero || (originalZero === 0 && to === count))
        part.endTangent = source.endTangent ?? source.startTangent;
    }
    const originalZero = source.closed ? (count - pivot) % count : 0;
    if (from <= originalZero && to >= originalZero)
      originalStartParameter =
        pieces.length +
        pointParameter(part.fitPoints, originalZero - from, source.knotParameterization);
    pieces.push(fitSpline(part));
  }
  let result = concatenateSplines(pieces);
  const start = originalStartParameter / pieces.length;
  if (source.closed && start > 1e-12 && start < 1 - 1e-12)
    result = concatenateSplines([sliceSpline(result, start, 1), sliceSpline(result, 0, start)]);
  return {
    ...result,
    fitPoints: source.fitPoints,
    closed: source.closed,
    periodic: false,
    fitTolerance: source.fitTolerance,
    knotParameterization: source.knotParameterization,
    kinkFitIndices: indices,
    ...(source.startTangent ? { startTangent: source.startTangent } : {}),
    ...(source.endTangent ? { endTangent: source.endTangent } : {}),
  };
}
