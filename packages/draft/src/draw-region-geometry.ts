import {
  conicComponents,
  cross3,
  distance3,
  dot3,
  evaluateGeometry,
  geometryEvaluation,
  magnitude3,
  normalize3,
  polylineSegments,
  subtract3,
  transformGeometry,
} from '@hancad/geom';
import type { Affine3, CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { prepareSnapCurve } from './snap-curves';
import { snapCurveIntersections } from './snap-intersections';

export interface RegionEdge {
  curve: CurveGeometry;
  sourceId: string;
}
export interface RegionLoop {
  edges: RegionEdge[];
  points: CadPoint[];
  area: number;
}
const near = (a: Vec3, b: Vec3): boolean => distance3(a, b) <= 1e-9;
export function regionSourceCurves(entity: CadEntity): CurveGeometry[] {
  if (entity.type === 'text' || entity.type === 'dimension') return [];
  if (['WIPEOUT', 'SOLID', 'TRACE', 'MLINE', 'POINT'].includes(entity.sourceType ?? '')) return [];
  if (entity.sourceType === 'REGION' && entity.regionLoops) return entity.regionLoops.flat();
  return legacyEntitySnapSources(entity)
    .flatMap(({ geometry }) =>
      geometry.type === 'LWPOLYLINE' || geometry.type === 'POLYLINE'
        ? polylineSegments(geometry).map((segment) => segment.geometry)
        : [geometry],
    )
    .filter((curve) => !['POINT', 'XLINE', 'RAY'].includes(curve.type));
}
export function reverseRegionCurve(curve: CurveGeometry): CurveGeometry {
  if (curve.type === 'LINE') return { ...curve, start: curve.end, end: curve.start };
  if (curve.type === 'ARC') {
    const result = {
      ...curve,
      startAngle: curve.startAngle + curve.sweepAngle,
      sweepAngle: -curve.sweepAngle,
    };
    delete result.startPoint;
    return result;
  }
  if (curve.type === 'ELLIPSE')
    return {
      ...curve,
      startParameter: curve.startParameter + curve.sweepParameter,
      sweepParameter: -curve.sweepParameter,
    };
  if (curve.type === 'SPLINE') {
    const sum = curve.knots[0]! + curve.knots.at(-1)!;
    const result = {
      ...curve,
      knots: [...curve.knots].reverse().map((k) => sum - k),
      controlPoints: [...curve.controlPoints].reverse(),
      weights: [...curve.weights].reverse(),
      fitPoints: [...curve.fitPoints].reverse(),
    };
    delete result.startTangent;
    delete result.endTangent;
    return result;
  }
  if (curve.type === 'TRANSFORMED') return { ...curve, source: reverseRegionCurve(curve.source) };
  return curve;
}
function planeProjection(points: readonly Vec3[]): Affine3 | undefined {
  const origin = points[0];
  if (!origin) return undefined;
  const second = points.find((p) => distance3(p, origin) > 1e-9);
  if (!second) return undefined;
  const u = normalize3(subtract3(second, origin));
  const third = points.find((p) => magnitude3(cross3(u, subtract3(p, origin))) > 1e-9);
  if (!third) return undefined;
  const n = normalize3(cross3(u, subtract3(third, origin))),
    v = cross3(n, u);
  if (points.some((p) => Math.abs(dot3(n, subtract3(p, origin))) > 1e-9)) return undefined;
  return [
    u.x,
    u.y,
    u.z,
    -dot3(u, origin),
    v.x,
    v.y,
    v.z,
    -dot3(v, origin),
    n.x,
    n.y,
    n.z,
    -dot3(n, origin),
  ];
}
function contribution(curve: CurveGeometry): number {
  if (curve.type === 'LINE') return (curve.start.x * curve.end.y - curve.start.y * curve.end.x) / 2;
  if (curve.type === 'ARC' || curve.type === 'CIRCLE' || curve.type === 'ELLIPSE') {
    const { a, b, start, sweep } = conicComponents(curve),
      c = curve.center,
      end = start + sweep;
    return (
      ((c.x * a.y - c.y * a.x) * (Math.cos(end) - Math.cos(start)) +
        (c.x * b.y - c.y * b.x) * (Math.sin(end) - Math.sin(start)) +
        (a.x * b.y - a.y * b.x) * sweep) /
      2
    );
  }
  const f = (t: number) => {
    const { point: p, derivative: d } = geometryEvaluation(curve, t);
    return (p.x * d.y - p.y * d.x) / 2;
  };
  const integrate = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    depth: number,
  ): number => {
    const mid = (a + b) / 2,
      leftMid = (a + mid) / 2,
      rightMid = (mid + b) / 2;
    const fl = f(leftMid),
      fr = f(rightMid),
      left = ((mid - a) * (fa + 4 * fl + fm)) / 6,
      right = ((b - mid) * (fm + 4 * fr + fb)) / 6;
    if (!depth || Math.abs(left + right - whole) < 1e-11)
      return left + right + (left + right - whole) / 15;
    return (
      integrate(a, mid, fa, fl, fm, left, depth - 1) +
      integrate(mid, b, fm, fr, fb, right, depth - 1)
    );
  };
  return integrate(0, 1, f(0), f(0.5), f(1), (f(0) + 4 * f(0.5) + f(1)) / 6, 18);
}
function selfCrosses(curves: readonly CurveGeometry[]): boolean {
  const segments = curves.flatMap((curve) =>
    curve.type === 'SPLINE' || curve.type === 'TRANSFORMED'
      ? Array.from({ length: 128 }, (_, i): CurveGeometry => ({
          type: 'LINE',
          start: evaluateGeometry(curve, i / 128),
          end: evaluateGeometry(curve, (i + 1) / 128),
        }))
      : [curve],
  );
  const prepared = segments.map(prepareSnapCurve);
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i]!,
        b = segments[j]!;
      if (a.type === 'LINE' && b.type === 'LINE') {
        const da = subtract3(a.end, a.start),
          db = subtract3(b.end, b.start),
          span = magnitude3(da);
        if (
          span > 1e-12 &&
          magnitude3(cross3(da, db)) <= 1e-10 * span &&
          magnitude3(cross3(da, subtract3(b.start, a.start))) <= 1e-10 * span
        ) {
          const axis = normalize3(da),
            t0 = dot3(subtract3(b.start, a.start), axis),
            t1 = dot3(subtract3(b.end, a.start), axis);
          if (Math.min(span, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) > 1e-9) return true;
        }
      }
      const intersections = snapCurveIntersections(prepared[i]!, prepared[j]!);
      if (
        intersections.some(
          (hit) =>
            ![0, 1].some((t) => near(hit.point, evaluateGeometry(a, t))) ||
            ![0, 1].some((t) => near(hit.point, evaluateGeometry(b, t))),
        )
      )
        return true;
      if (intersections.length && j !== i + 1 && !(i === 0 && j === segments.length - 1))
        return true;
    }
  return false;
}
function validateLoop(edges: RegionEdge[]): RegionLoop | undefined {
  const curves = edges.map((e) => e.curve);
  const sampled = curves.flatMap((curve) => {
    const count = curve.type === 'LINE' ? 2 : 33;
    return Array.from({ length: count }, (_, i) => evaluateGeometry(curve, i / (count - 1)));
  });
  // Spline control points are also checked; sample planarity alone is insufficient.
  const controls = curves.flatMap((curve) => (curve.type === 'SPLINE' ? curve.controlPoints : []));
  const matrix = planeProjection([...sampled, ...controls]);
  if (!matrix) return undefined;
  const projected = curves.map((c) => transformGeometry(c, matrix));
  const area = Math.abs(projected.reduce((sum, curve) => sum + contribution(curve), 0));
  if (area <= 1e-12 || selfCrosses(projected)) return undefined;
  const points = curves.flatMap((curve) => {
    const count = curve.type === 'LINE' ? 1 : 64;
    return Array.from({ length: count }, (_, i) => {
      const p = evaluateGeometry(curve, i / count);
      return { x: p.x, y: -p.y, z: p.z };
    });
  });
  return { edges, points, area };
}
/** End-connected topology retains every exact curve; only the viewport proxy is sampled. */
export function regionLoops(entities: readonly CadEntity[]): RegionLoop[] {
  const pending: RegionEdge[] = entities.flatMap((entity) =>
    regionSourceCurves(entity).map((curve) => ({ curve, sourceId: entity.id })),
  );
  if (pending.length > 4096) return [];
  const loops: RegionLoop[] = [];
  while (pending.length) {
    const first = pending.shift()!,
      edges = [first],
      start = evaluateGeometry(first.curve, 0);
    let end = evaluateGeometry(first.curve, 1),
      valid = true;
    while (!near(start, end)) {
      const candidates = pending.flatMap((edge, i) =>
        near(evaluateGeometry(edge.curve, 0), end)
          ? [{ i, reverse: false }]
          : near(evaluateGeometry(edge.curve, 1), end)
            ? [{ i, reverse: true }]
            : [],
      );
      if (candidates.length !== 1) {
        valid = false;
        break;
      }
      const candidate = candidates[0]!,
        edge = pending.splice(candidate.i, 1)[0]!;
      if (candidate.reverse) edge.curve = reverseRegionCurve(edge.curve);
      edges.push(edge);
      end = evaluateGeometry(edge.curve, 1);
    }
    if (valid) {
      const loop = validateLoop(edges);
      if (loop) loops.push(loop);
    }
  }
  // Crossings between closed loops invalidate both; nested disjoint loops remain separate regions.
  const rejected = new Set<RegionLoop>();
  for (let i = 0; i < loops.length; i++)
    for (let j = i + 1; j < loops.length; j++) {
      const a = loops[i]!,
        b = loops[j]!;
      const crossing = a.edges.some((ea) =>
        b.edges.some((eb) =>
          snapCurveIntersections(prepareSnapCurve(ea.curve), prepareSnapCurve(eb.curve)).some(
            (hit) => distance3(hit.point, hit.second) <= 1e-9,
          ),
        ),
      );
      if (crossing) {
        rejected.add(a);
        rejected.add(b);
      }
    }
  return loops.filter((loop) => !rejected.has(loop));
}
