import type { SplineGeometry } from '@hancad/geom';
import type { CadEntity, CadPoint } from './types';

/** DXF spline-fit POLYLINEs use the original flagged frame, never generated display vertices. */
export function importSplinePolyline(
  frame: readonly CadPoint[],
  degree: 2 | 3,
  closed: boolean,
): Pick<CadEntity, 'curve' | 'sourceType'> {
  const points = frame.map((point) => ({ x: point.x, y: -point.y, z: point.z ?? 0 }));
  if (
    closed &&
    points.length > 1 &&
    ['x', 'y', 'z'].every(
      (axis) => points[0]![axis as 'x' | 'y' | 'z'] === points.at(-1)![axis as 'x' | 'y' | 'z'],
    )
  )
    points.pop();
  if (points.length <= degree) throw new Error('Spline-fit polyline has too few frame vertices.');
  if (closed) points.push(...points.slice(0, degree));
  const spanCount = points.length - degree;
  const curve: SplineGeometry = {
    type: 'SPLINE',
    degree,
    knots: closed
      ? Array.from({ length: points.length + degree + 1 }, (_, index) => index)
      : [
          ...Array<number>(degree + 1).fill(0),
          ...Array.from({ length: spanCount - 1 }, (_, index) => (index + 1) / spanCount),
          ...Array<number>(degree + 1).fill(1),
        ],
    controlPoints: points,
    weights: points.map(() => 1),
    fitPoints: [],
    closed,
    periodic: closed,
    fitTolerance: 0,
    knotParameterization: 'uniform',
  };
  return {
    curve,
    sourceType: degree === 2 ? 'POLYLINE_SPLINE_QUADRATIC' : 'POLYLINE_SPLINE_CUBIC',
  };
}
