import { evaluateGeometry } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { nearestSnapPoint, prepareSnapCurve, snapCurveParts } from './snap-curves';
import { snapCurveIntersections } from './snap-intersections';

/** Classify exact source curves at every polygon crossing, independently of fallback vertices. */
export function selectDrawCurvePath(
  entity: CadEntity,
  points: readonly CadPoint[],
  mode: 'window' | 'crossing' | 'fence',
  contains: (point: CadPoint) => boolean,
): boolean | undefined {
  const definitions: CurveGeometry[] = entity.curve
    ? [entity.curve]
    : (entity.regionLoops?.flat() ??
      entity.drawPaths?.flatMap((path) =>
        path.slice(1).map((p, i) => ({
          type: 'LINE' as const,
          start: { x: path[i]!.x, y: -path[i]!.y, z: path[i]!.z ?? 0 },
          end: { x: p.x, y: -p.y, z: p.z ?? 0 },
        })),
      ) ??
      []);
  if (!definitions.length) return undefined;
  const paths = points.slice(1).map((p, i) => [points[i]!, p] as const);
  if (mode !== 'fence') paths.push([points.at(-1)!, points[0]!]);
  const edges = paths.map(([a, b]) =>
    prepareSnapCurve({
      type: 'LINE',
      start: { x: a.x, y: -a.y, z: a.z ?? 0 },
      end: { x: b.x, y: -b.y, z: b.z ?? 0 },
    }),
  );
  let touched = false,
    inside = false,
    allInside = true;
  for (const curve of definitions.flatMap(snapCurveParts)) {
    if (mode === 'window' && (curve.type === 'XLINE' || curve.type === 'RAY')) return false;
    const prepared = prepareSnapCurve(curve),
      parameters = [0, 1];
    for (const edge of edges) {
      const hits = snapCurveIntersections(prepared, edge);
      if (hits.length) touched = true;
      parameters.push(...hits.map((hit) => hit.firstParameter).filter((t) => t >= 0 && t <= 1));
      if (mode === 'fence')
        for (const sample of edge.samples) {
          const nearest = nearestSnapPoint(prepared, sample.point).point;
          if (Math.hypot(nearest.x - sample.point.x, nearest.y - sample.point.y) <= 1e-9)
            touched = true;
        }
    }
    parameters.sort((a, b) => a - b);
    const samples = [
      ...prepared.samples.map((s) => s.point),
      ...parameters.slice(1).map((t, i) => evaluateGeometry(curve, (t + parameters[i]!) / 2)),
    ];
    for (const point of samples) {
      const value = contains({ x: point.x, y: -point.y });
      inside ||= value;
      allInside &&= value;
    }
  }
  return mode === 'fence' ? touched : mode === 'crossing' ? touched || inside : allInside;
}
