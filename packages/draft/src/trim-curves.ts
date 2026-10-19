import { conicComponents, evaluateGeometry, polylineSegments } from '@hancad/geom';
import type { CurveGeometry, InfiniteGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { editCurve, editCurveEntity, sliceEditCurve } from './modify-curve-geometry';
import {
  extendedSnapCurves,
  isClosedSnapCurve,
  nearestSnapPoint,
  prepareSnapCurve,
  snapCurveParts,
} from './snap-curves';
import { snapCurveIntersections } from './snap-intersections';
import { snapWcs } from './snap-types';
import type { TrimExtendTool } from './trim-geometry';
import { concatenateSplines } from './modify-spline-geometry';
import { tangentSplineExtension } from './trim-spline-extension';

const epsilon = 1e-9;
interface CurvePart {
  curve: CurveGeometry;
  from: number;
  size: number;
}
function parts(curve: CurveGeometry): CurvePart[] {
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const segments = polylineSegments(curve);
    return segments.map((part, index) => ({
      curve: part.geometry,
      from: index / segments.length,
      size: 1 / segments.length,
    }));
  }
  return [{ curve, from: 0, size: 1 }];
}
function parameter(curve: CurveGeometry, point: Vec3): number {
  if (curve.type === 'ARC' || curve.type === 'CIRCLE' || curve.type === 'ELLIPSE') {
    const { a, b, start, sweep } = conicComponents(curve),
      x = point.x - curve.center.x,
      y = point.y - curve.center.y,
      det = a.x * b.y - a.y * b.x;
    const angle = Math.atan2((a.x * y - a.y * x) / det, (x * b.y - y * b.x) / det);
    return (
      ((((Math.sign(sweep) * (angle - start)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) /
      Math.abs(sweep)
    );
  }
  return nearestSnapPoint(prepareSnapCurve(curve), point, true).parameter;
}

/** Intersections retain exact curve parameters and reject false projected Z hits when requested. */
export function trimCurveCuts(
  curve: CurveGeometry,
  boundaries: readonly CurveGeometry[],
  extendTarget = false,
  extendEdge = false,
  project: 'None' | 'UCS' | 'View' = 'UCS',
): number[] {
  const result: number[] = [];
  for (const part of parts(curve)) {
    const targets = extendTarget ? extendedSnapCurves(part.curve) : [part.curve];
    for (const target of targets)
      for (const boundary of boundaries.flatMap(snapCurveParts)) {
        for (const edge of extendEdge ? extendedSnapCurves(boundary) : [boundary]) {
          const hits = snapCurveIntersections(prepareSnapCurve(target), prepareSnapCurve(edge));
          for (const hit of hits) {
            if (project === 'None' && Math.abs(hit.point.z - hit.second.z) > epsilon) continue;
            const t = extendTarget ? parameter(part.curve, hit.point) : hit.firstParameter;
            result.push(part.from + t * part.size);
          }
        }
      }
  }
  return result
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .filter((t, i, sorted) => !i || Math.abs(t - sorted[i - 1]!) > epsilon);
}

function wrappedSlice(curve: CurveGeometry, from: number, to: number): CurveGeometry | undefined {
  if (to <= 1 || curve.type === 'CIRCLE' || curve.type === 'ARC' || curve.type === 'ELLIPSE')
    return sliceEditCurve(curve, from, to);
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const a = sliceEditCurve(curve, from, 1),
      b = sliceEditCurve(curve, 0, to - 1);
    if (
      a &&
      b &&
      (a.type === 'LWPOLYLINE' || a.type === 'POLYLINE') &&
      (b.type === 'LWPOLYLINE' || b.type === 'POLYLINE')
    )
      return { ...a, vertices: [...a.vertices.slice(0, -1), ...b.vertices], closed: false };
  }
  if (curve.type === 'SPLINE') {
    const a = sliceEditCurve(curve, from, 1),
      b = sliceEditCurve(curve, 0, to - 1);
    if (a?.type === 'SPLINE' && b?.type === 'SPLINE') return concatenateSplines([a, b]);
  }
  return undefined;
}

function extendCurve(
  curve: CurveGeometry,
  point: Vec3,
  boundaries: readonly CurveGeometry[],
  edge: boolean,
  project: 'None' | 'UCS' | 'View',
): CurveGeometry | undefined {
  if (isClosedSnapCurve(curve)) return;
  const pick = nearestSnapPoint(prepareSnapCurve(curve), point).parameter,
    start = pick < 0.5;
  if (curve.type === 'SPLINE') {
    return tangentSplineExtension(curve, start, (ray) =>
      trimCurveCuts(ray, boundaries, false, edge, project),
    );
  }
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const segments = polylineSegments(curve),
      index = start ? 0 : segments.length - 1;
    const original = segments[index]?.geometry;
    if (!original) return;
    const end = evaluateGeometry(original, start ? 0 : 1);
    const changed = extendCurve(original, end, boundaries, edge, project);
    if (!changed) return;
    const vertices = curve.vertices.map((v) => ({ ...v }));
    const first = vertices[index]!,
      last = vertices[index + 1]!;
    first.position = evaluateGeometry(changed, 0);
    last.position = evaluateGeometry(changed, 1);
    first.bulge = changed.type === 'ARC' ? Math.tan(changed.sweepAngle / 4) : 0;
    return { ...curve, vertices };
  }
  const cuts = trimCurveCuts(curve, boundaries, true, edge, project).map((t) => {
    if (curve.type === 'ARC' || curve.type === 'ELLIPSE') {
      const period =
        (2 * Math.PI) / Math.abs(curve.type === 'ARC' ? curve.sweepAngle : curve.sweepParameter);
      if (start && t >= -epsilon) return t - period;
      if (!start && t <= 1 + epsilon) return t + period;
    }
    return t;
  });
  const t = start
    ? cuts.filter((t) => t < -epsilon).sort((a, b) => b - a)[0]
    : cuts.filter((t) => t > 1 + epsilon).sort((a, b) => a - b)[0];
  if (t === undefined) return;
  return sliceEditCurve(curve, start ? t : 0, start ? 1 : t);
}

export function trimExtendEntity(
  entity: CadEntity,
  point: CadPoint,
  boundaries: readonly CurveGeometry[],
  tool: TrimExtendTool,
  extendEdge = false,
  deleteUncut = false,
  project: 'None' | 'UCS' | 'View' = 'UCS',
): CadEntity[] | undefined {
  const curve = editCurve(entity);
  if (!curve || ['POINT', 'HELIX', 'TRANSFORMED'].includes(curve.type)) return;
  if (curve.type === 'XLINE' || curve.type === 'RAY')
    return trimInfiniteEntity(
      entity,
      curve,
      point,
      boundaries,
      tool,
      extendEdge,
      deleteUncut,
      project,
    );
  if (tool === 'EXTEND') {
    const extended = extendCurve(curve, snapWcs(point), boundaries, extendEdge, project);
    return extended ? [editCurveEntity(entity, extended)] : undefined;
  }
  const closed = isClosedSnapCurve(curve),
    rawCuts = trimCurveCuts(curve, boundaries, false, extendEdge, project),
    cuts = closed
      ? rawCuts
          .map((t) => {
            const value = ((t % 1) + 1) % 1;
            return value < epsilon || value > 1 - epsilon ? 0 : value;
          })
          .sort((a, b) => a - b)
          .filter((t, i, all) => !i || Math.abs(t - all[i - 1]!) > epsilon)
      : rawCuts.filter((t) => t > epsilon && t < 1 - epsilon),
    pick = nearestSnapPoint(prepareSnapCurve(curve), snapWcs(point)).parameter;
  if (cuts.length < (closed ? 2 : 1)) return deleteUncut ? [] : undefined;
  const left = cuts.filter((t) => t <= pick).at(-1) ?? (closed ? cuts.at(-1)! - 1 : 0),
    right = cuts.find((t) => t > pick) ?? (closed ? cuts[0]! + 1 : 1);
  const ranges = closed
    ? [[right % 1, (left + 1) % 1]]
    : [
        [0, left],
        [right, 1],
      ];
  const result: CadEntity[] = [];
  for (const [from = 0, initialTo = 1] of ranges) {
    const to = closed && initialTo <= from ? initialTo + 1 : initialTo;
    const sliced = closed ? wrappedSlice(curve, from, to) : sliceEditCurve(curve, from, to);
    if (sliced)
      result.push(
        editCurveEntity(entity, sliced, result.length ? `trim-${crypto.randomUUID()}` : entity.id),
      );
  }
  return result.length ? result : undefined;
}

/** Infinite domains retain rays; bounded surviving intervals become LINEs. */
function trimInfiniteEntity(
  entity: CadEntity,
  curve: InfiniteGeometry,
  point: CadPoint,
  boundaries: readonly CurveGeometry[],
  tool: TrimExtendTool,
  extendEdge: boolean,
  deleteUncut: boolean,
  project: 'None' | 'UCS' | 'View',
): CadEntity[] | undefined {
  const cuts = trimCurveCuts(curve, boundaries, tool === 'EXTEND', extendEdge, project);
  const at = (t: number): Vec3 => ({
    x: curve.basePoint.x + curve.direction.x * t,
    y: curve.basePoint.y + curve.direction.y * t,
    z: curve.basePoint.z + curve.direction.z * t,
  });
  if (tool === 'EXTEND') {
    if (curve.type === 'XLINE') return;
    const t = cuts.filter((t) => t < -epsilon).at(-1);
    return t === undefined ? undefined : [editCurveEntity(entity, { ...curve, basePoint: at(t) })];
  }
  const valid = curve.type === 'RAY' ? cuts.filter((t) => t > epsilon) : cuts;
  if (!valid.length) return deleteUncut ? [] : undefined;
  const pick = nearestSnapPoint(prepareSnapCurve(curve), snapWcs(point)).parameter;
  const left = valid.filter((t) => t <= pick).at(-1) ?? (curve.type === 'RAY' ? 0 : -Infinity);
  const right = valid.find((t) => t > pick) ?? Infinity;
  const survivors: CurveGeometry[] = [];
  if (Number.isFinite(left)) {
    if (curve.type === 'XLINE')
      survivors.push({
        ...curve,
        type: 'RAY',
        basePoint: at(left),
        direction: { x: -curve.direction.x, y: -curve.direction.y, z: -curve.direction.z },
      });
    else if (left > epsilon)
      survivors.push({ type: 'LINE', start: curve.basePoint, end: at(left) });
  }
  if (Number.isFinite(right)) survivors.push({ ...curve, type: 'RAY', basePoint: at(right) });
  return survivors.map((survivor, index) =>
    editCurveEntity(entity, survivor, index ? `trim-${crypto.randomUUID()}` : entity.id),
  );
}
