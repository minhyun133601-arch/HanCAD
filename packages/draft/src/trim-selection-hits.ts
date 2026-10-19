import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { evaluateGeometry, geometryBounds } from '@hancad/geom';
import type { CurveGeometry, GeometryBounds } from '@hancad/geom';
import { editCurve } from './modify-curve-geometry';
import { trimCurveCuts } from './trim-curves';
import { snapModel } from './snap-types';
import { selectCadArea } from './selection';

export function trimFenceHits(
  entities: readonly CadEntity[],
  points: readonly CadPoint[],
  visible: (entity: CadEntity) => boolean,
): { sourceId: string; point: CadPoint; order: number }[] {
  const hits: { sourceId: string; point: CadPoint; order: number }[] = [];
  const fence = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    fence.minX = Math.min(fence.minX, point.x);
    fence.maxX = Math.max(fence.maxX, point.x);
    fence.minY = Math.min(fence.minY, -point.y);
    fence.maxY = Math.max(fence.maxY, -point.y);
  }
  const cache = new WeakMap<CadEntity, { curve: CurveGeometry; bounds: GeometryBounds } | null>();
  const margin = Math.max(
    1e-8,
    Number.EPSILON *
      64 *
      Math.max(
        Math.abs(fence.minX),
        Math.abs(fence.maxX),
        Math.abs(fence.minY),
        Math.abs(fence.maxY),
      ),
  );
  fence.minX -= margin;
  fence.maxX += margin;
  fence.minY -= margin;
  fence.maxY += margin;
  for (const entity of entities) {
    let source = cache.get(entity);
    if (source === undefined) {
      const curve = visible(entity) ? editCurve(entity) : undefined;
      source = curve ? { curve, bounds: geometryBounds(curve) } : null;
      cache.set(entity, source);
    }
    if (
      !source ||
      source.bounds.max.x < fence.minX ||
      source.bounds.min.x > fence.maxX ||
      source.bounds.max.y < fence.minY ||
      source.bounds.min.y > fence.maxY
    )
      continue;
    const curve = source.curve;
    const seen: CadPoint[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (!a || !b) continue;
      const parameters = trimCurveCuts(curve, [
        {
          type: 'LINE',
          start: { x: a.x, y: -a.y, z: a.z ?? 0 },
          end: { x: b.x, y: -b.y, z: b.z ?? 0 },
        },
      ]);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        square = dx * dx + dy * dy;
      if (!square) continue;
      for (const t of parameters.filter(
        (t) => curve.type === 'XLINE' || (t >= 0 && (curve.type === 'RAY' || t <= 1)),
      )) {
        const point = snapModel(evaluateGeometry(curve, t));
        const along = ((point.x - a.x) * dx + (point.y - a.y) * dy) / square;
        if (!seen.some((hit) => Math.hypot(hit.x - point.x, hit.y - point.y) < 1e-8)) {
          hits.push({ sourceId: entity.id, point, order: i + along });
          seen.push(point);
        }
      }
    }
  }
  return hits;
}

export function trimCrossingHits(
  state: LegacyCadState,
  a: CadPoint,
  b: CadPoint,
): { entity: CadEntity; point: CadPoint; order: number }[] {
  const ids = new Set(selectCadArea(state, a, b, 'crossing'));
  let corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  if ((b.x - a.x) * (b.y - a.y) < 0) corners = [a, corners[3]!, b, corners[1]!];
  return state.entities
    .filter((entity) => ids.has(entity.id))
    .map((entity) => {
      const curve = editCurve(entity);
      if (!curve) return { entity, point: a, order: Infinity };
      const intersections = corners
        .flatMap((from, index) => {
          const to = corners[(index + 1) % corners.length]!;
          const cuts = trimCurveCuts(curve, [
            {
              type: 'LINE',
              start: { x: from.x, y: -from.y, z: 0 },
              end: { x: to.x, y: -to.y, z: 0 },
            },
          ]);
          return cuts.map((t) => {
            const point = snapModel(evaluateGeometry(curve, t));
            return {
              point,
              order:
                index +
                Math.hypot(point.x - from.x, point.y - from.y) /
                  Math.max(1e-12, Math.hypot(to.x - from.x, to.y - from.y)),
            };
          });
        })
        .sort((x, y) => x.order - y.order);
      return { entity, ...(intersections[0] ?? { point: a, order: Infinity }) };
    })
    .sort((x, y) => x.order - y.order);
}
