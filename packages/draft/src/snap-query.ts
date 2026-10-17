import { geometryEvaluation } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import {
  extendedSnapCurves,
  nearestSnapPoint,
  normalSnapPoints,
  prepareSnapCurve,
  snapCurveParts,
  squaredXY,
} from './snap-curves';
import { snapCurveIntersections } from './snap-intersections';
import { SnapIndex, type PreparedSnapSource } from './snap-index';
import {
  snapModeBits,
  snapModel,
  snapWcs,
  type DraftSnap,
  type DraftSnapKind,
  type SnapQueryOptions,
  type SnapSource,
} from './snap-types';

/** Every eligible point is retained for Tab cycling; no database or acquisition state is mutated. */
export function querySnapCandidates(
  index: SnapIndex,
  point: CadPoint,
  tolerance: number,
  osmode: number,
  options: SnapQueryOptions = {},
): DraftSnap[] {
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isInteger(osmode) ||
    osmode <= 0 ||
    osmode & 16384
  )
    return [];
  const wcs = snapWcs(point),
    osoptions = options.osoptions ?? 7,
    candidates: DraftSnap[] = [];
  const allowed = (source: SnapSource) => !(source.hatch && osoptions & 1);
  const offer = (
    position: Vec3,
    kind: DraftSnapKind,
    source: SnapSource,
    metadata: Partial<Pick<DraftSnap, 'parameter' | 'deferred' | 'otherSource'>> = {},
  ): void => {
    if (
      !allowed(source) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      squaredXY(position, wcs) > tolerance * tolerance
    )
      return;
    if (options.dynamicUcs && osoptions & 2 && position.z < 0) return;
    if (kind === 'endpoint' && source.dimensionExtension && osoptions & 4) return;
    if (kind === 'node' && source.node === false) return;
    if (
      candidates.some(
        (candidate) =>
          candidate.kind === kind &&
          candidate.source.id === source.id &&
          squaredXY(snapWcs(candidate.point), position) <= 1e-20,
      )
    )
      return;
    candidates.push({
      point: snapModel(position),
      kind,
      entityId: source.entityId ?? source.id,
      source,
      elevation: position.z,
      ...metadata,
    });
  };
  const entries = index.query(point, tolerance).filter((entry) => allowed(entry.source));
  for (const entry of entries) {
    const source = entry.source;
    for (const candidate of entry.points)
      if (osmode & snapModeBits[candidate.kind])
        offer(
          candidate.point,
          candidate.kind,
          source,
          candidate.parameter === undefined ? {} : { parameter: candidate.parameter },
        );
    for (const curve of entry.curves) {
      if (curve.geometry.type === 'POINT' && source.node === false) continue;
      if (osmode & 512) {
        const nearest = nearestSnapPoint(curve, wcs);
        offer(nearest.point, 'nearest', source, { parameter: nearest.parameter });
      }
      for (const kind of ['perpendicular', 'tangent'] as const) {
        if (!(osmode & snapModeBits[kind])) continue;
        if (kind === 'tangent' && ['LINE', 'XLINE', 'RAY', 'POINT'].includes(curve.geometry.type))
          continue;
        if (options.basePoint) {
          for (const candidate of normalSnapPoints(curve, snapWcs(options.basePoint), kind, wcs))
            offer(candidate.point, kind, source, { parameter: candidate.parameter });
        } else {
          const nearest = nearestSnapPoint(curve, wcs);
          offer(nearest.point, kind, source, {
            parameter: nearest.parameter,
            deferred: {
              kind,
              source: { ...source, geometry: curve.geometry },
              near: snapModel(nearest.point),
            },
          });
        }
      }
    }
  }
  if (osmode & (32 | 2048)) {
    const intersectionEntries = mergeIntersectionEntries(
      index,
      entries,
      options.intersectionSources ?? [],
    ).filter((entry) => allowed(entry.source));
    for (let i = 0; i < intersectionEntries.length; i++)
      for (let j = i; j < intersectionEntries.length; j++) {
        const a = intersectionEntries[i]!,
          b = intersectionEntries[j]!;
        for (let ai = 0; ai < a.curves.length; ai++)
          for (let bi = i === j ? ai + 1 : 0; bi < b.curves.length; bi++) {
            const ca = a.curves[ai]!,
              cb = b.curves[bi]!;
            for (const hit of snapCurveIntersections(
              ca,
              cb,
              options.extendedIntersection === true,
            )) {
              if (options.dynamicUcs && osoptions & 2 && hit.second.z < 0) continue;
              const zTolerance =
                1e-9 +
                Number.EPSILON * Math.max(Math.abs(hit.point.z), Math.abs(hit.second.z)) * 32;
              const trueIntersection = Math.abs(hit.point.z - hit.second.z) <= zTolerance;
              if (trueIntersection && osmode & 32)
                offer(hit.point, 'intersection', a.source, {
                  parameter: hit.firstParameter,
                  otherSource: b.source,
                });
              if (osmode & 2048)
                offer(hit.point, 'apparentIntersection', a.source, {
                  parameter: hit.firstParameter,
                  otherSource: b.source,
                });
            }
          }
      }
  }
  if (osmode & 4096)
    for (const source of options.extensions ?? [])
      for (const part of snapCurveParts(source.geometry)) {
        for (const natural of extendedSnapCurves(part)) {
          const projected = nearestSnapPoint(prepareSnapCurve(natural), wcs, true);
          const original = nearestSnapPoint(prepareSnapCurve(part), projected.point);
          if (squaredXY(original.point, projected.point) > 1e-18)
            offer(projected.point, 'extension', source, { parameter: projected.parameter });
        }
      }
  if (osmode & 8192 && options.basePoint)
    for (const source of options.parallels ?? [])
      for (const part of snapCurveParts(source.geometry)) {
        if (part.type !== 'LINE' && part.type !== 'RAY' && part.type !== 'XLINE') continue;
        const derivative = geometryEvaluation(part, 0).derivative,
          base = snapWcs(options.basePoint);
        const natural: CurveGeometry = { type: 'XLINE', basePoint: base, direction: derivative };
        const projected = nearestSnapPoint(prepareSnapCurve(natural), wcs);
        offer(projected.point, 'parallel', source, { parameter: projected.parameter });
      }
  return candidates
    .map((candidate, order) => ({
      candidate,
      order,
      distance: squaredXY(snapWcs(candidate.point), wcs),
    }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .map((item) => item.candidate);
}
function mergeIntersectionEntries(
  index: SnapIndex,
  entries: PreparedSnapSource[],
  sources: readonly SnapSource[],
): PreparedSnapSource[] {
  if (!sources.length) return entries;
  const result = [...entries],
    ids = new Set(entries.map((entry) => entry.source.id));
  for (const source of sources)
    if (!ids.has(source.id)) {
      const queried = index.prepared(source.id) ?? new SnapIndex([source]).prepared(source.id);
      if (queried) result.push(queried);
      ids.add(source.id);
    }
  return result;
}
export { extendedSnapCurves } from './snap-curves';

/** Two explicit source picks can resolve a crossing outside the second pick's aperture. */
export function acquiredSnapIntersections(
  first: SnapSource,
  second: SnapSource,
  osmode: number,
  options: Pick<SnapQueryOptions, 'osoptions' | 'dynamicUcs'> = {},
): DraftSnap[] {
  const osoptions = options.osoptions ?? 7;
  if (!(osmode & (32 | 2048)) || osmode & 16384 || ((first.hatch || second.hatch) && osoptions & 1))
    return [];
  const hits: DraftSnap[] = [];
  for (const a of snapCurveParts(first.geometry))
    for (const b of snapCurveParts(second.geometry)) {
      for (const hit of snapCurveIntersections(prepareSnapCurve(a), prepareSnapCurve(b), true)) {
        if (options.dynamicUcs && osoptions & 2 && (hit.point.z < 0 || hit.second.z < 0)) continue;
        const zTolerance =
          1e-9 + Number.EPSILON * Math.max(Math.abs(hit.point.z), Math.abs(hit.second.z)) * 32;
        const trueIntersection = Math.abs(hit.point.z - hit.second.z) <= zTolerance;
        for (const kind of ['intersection', 'apparentIntersection'] as const) {
          if (!(osmode & snapModeBits[kind]) || (kind === 'intersection' && !trueIntersection))
            continue;
          if (
            hits.some(
              (other) => other.kind === kind && squaredXY(snapWcs(other.point), hit.point) < 1e-18,
            )
          )
            continue;
          hits.push({
            point: snapModel(hit.point),
            kind,
            entityId: first.entityId ?? first.id,
            source: first,
            otherSource: second,
            elevation: hit.point.z,
            parameter: hit.firstParameter,
          });
        }
      }
    }
  return hits;
}
