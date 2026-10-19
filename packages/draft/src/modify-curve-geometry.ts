import { evaluateGeometry, polylineSegments } from '@hancad/geom';
import type { CurveGeometry, PolylineGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity, CadPolyline } from '@hancad/legacy-bridge';
import { model } from './draw-curve-helpers';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { reverseRegionCurve } from './draw-region-geometry';
import { sliceSpline } from './modify-spline-geometry';

export const near3 = (a: Vec3, b: Vec3, tolerance = 1e-9): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= tolerance;
export function editCurve(entity: CadEntity): CurveGeometry | undefined {
  if (entity.type === 'text' || entity.type === 'dimension' || entity.regionLoops || entity.mline)
    return;
  return legacyEntitySnapSources(entity)[0]?.geometry;
}
/** The display proxy is sampled only for types with an authoritative exact source. */
export function editCurveEntity(
  original: CadEntity,
  curve: CurveGeometry,
  id = original.id,
): CadEntity {
  const base = { ...original, id, curve, sourceType: curve.type };
  delete base.drawPaths;
  delete base.drawFill;
  delete base.regionLoops;
  delete base.regionArea;
  delete base.mline;
  delete base.cloudVertices;
  if (curve.type === 'LINE')
    return { ...base, type: 'line', a: model(curve.start), b: model(curve.end) };
  if (curve.type === 'CIRCLE')
    return { ...base, type: 'circle', center: model(curve.center), radius: curve.radius };
  if (curve.type === 'ARC')
    return {
      ...base,
      type: 'arc',
      center: model(curve.center),
      radius: curve.radius,
      startAngle: -curve.startAngle,
      endAngle: -curve.startAngle - curve.sweepAngle,
      clockwise: curve.sweepAngle < 0,
    };
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE')
    return {
      ...base,
      type: 'polyline',
      points: curve.vertices.map((v) => model(v.position)),
      closed: curve.closed,
      bulges: curve.vertices.map((v) => -v.bulge),
      startWidths: curve.vertices.map((v) => v.startWidth),
      endWidths: curve.vertices.map((v) => v.endWidth),
      constantWidth: curve.constantWidth,
    };
  const count = curve.type === 'SPLINE' ? Math.max(32, curve.controlPoints.length * 8) : 64;
  return {
    ...base,
    type: 'polyline',
    points: Array.from({ length: count + 1 }, (_, i) => model(evaluateGeometry(curve, i / count))),
    closed:
      'closed' in curve
        ? curve.closed
        : curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) >= 2 * Math.PI - 1e-10,
  };
}
export function polylineCurve(
  curves: readonly CurveGeometry[],
  original?: PolylineGeometry,
): PolylineGeometry {
  const vertices = curves.map((curve) => ({
    position: evaluateGeometry(curve, 0),
    bulge: curve.type === 'ARC' ? Math.tan(curve.sweepAngle / 4) : 0,
    startWidth: 0,
    endWidth: 0,
  }));
  const end = evaluateGeometry(curves.at(-1)!, 1),
    closed = near3(vertices[0]!.position, end);
  if (!closed) vertices.push({ position: end, bulge: 0, startWidth: 0, endWidth: 0 });
  return {
    type: original?.type ?? 'LWPOLYLINE',
    vertices,
    closed,
    is3D: original?.is3D ?? false,
    normal: original?.normal ?? { x: 0, y: 0, z: 1 },
    constantWidth: original?.constantWidth ?? 0,
  };
}
export function sliceEditCurve(
  curve: CurveGeometry,
  from: number,
  to: number,
): CurveGeometry | undefined {
  if (to - from <= 1e-12) return;
  if (curve.type === 'LINE') {
    const point = (t: number): Vec3 => ({
      x: curve.start.x + (curve.end.x - curve.start.x) * t,
      y: curve.start.y + (curve.end.y - curve.start.y) * t,
      z: curve.start.z + (curve.end.z - curve.start.z) * t,
    });
    return { ...curve, start: point(from), end: point(to) };
  }
  if (curve.type === 'ARC' || curve.type === 'CIRCLE') {
    const start = curve.type === 'ARC' ? curve.startAngle : 0,
      sweep = curve.type === 'ARC' ? curve.sweepAngle : Math.PI * 2;
    const result: CurveGeometry = {
      ...curve,
      type: 'ARC',
      startAngle: start + sweep * from,
      sweepAngle: sweep * (to - from),
    };
    delete result.startPoint;
    return result;
  }
  if (curve.type === 'ELLIPSE')
    return {
      ...curve,
      startParameter: curve.startParameter + curve.sweepParameter * from,
      sweepParameter: curve.sweepParameter * (to - from),
    };
  if (curve.type === 'SPLINE') return sliceSpline(curve, from, to);
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const segments = polylineSegments(curve),
      n = segments.length;
    const first = Math.floor(from * n + 1e-12),
      last = Math.min(n - 1, Math.ceil(to * n - 1e-12) - 1);
    const selected: CurveGeometry[] = [],
      widths: [number, number][] = [];
    for (let i = first; i <= last; i++) {
      const a = Math.max(0, from * n - i),
        b = Math.min(1, to * n - i),
        segment = segments[i];
      if (!segment) continue;
      const sliced = sliceEditCurve(segment.geometry, a, b);
      if (!sliced) continue;
      selected.push(sliced);
      const v = curve.vertices[i]!,
        delta = v.endWidth - v.startWidth;
      widths.push([v.startWidth + delta * a, v.startWidth + delta * b]);
    }
    if (!selected.length) return;
    const result = polylineCurve(selected, curve);
    return {
      ...result,
      closed: false,
      vertices: result.vertices.map((v, i) => ({
        ...v,
        startWidth: widths[i]?.[0] ?? 0,
        endWidth: widths[i]?.[1] ?? 0,
      })),
    };
  }
  return undefined;
}
export function reverseEditCurve(curve: CurveGeometry, reverseWidths = false): CurveGeometry {
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const n = curve.vertices.length;
    return {
      ...curve,
      vertices: [...curve.vertices].reverse().map((v, i) => {
        const source = curve.vertices[(n - i - 2 + n) % n]!;
        return {
          ...v,
          bulge: -source.bulge,
          startWidth: reverseWidths ? source.endWidth : source.startWidth,
          endWidth: reverseWidths ? source.startWidth : source.endWidth,
        };
      }),
    };
  }
  if (curve.type === 'HELIX') {
    const end = evaluateGeometry(curve, 1);
    return {
      ...curve,
      center: { x: curve.center.x, y: curve.center.y, z: end.z },
      baseRadius: curve.topRadius,
      topRadius: curve.baseRadius,
      height: -curve.height,
      clockwise: !curve.clockwise,
      startAngle: curve.startAngle + (curve.clockwise ? -1 : 1) * curve.turns * Math.PI * 2,
    };
  }
  const reversed = reverseRegionCurve(curve);
  if (curve.type === 'SPLINE' && reversed.type === 'SPLINE') {
    if (curve.kinkFitIndices)
      reversed.kinkFitIndices = curve.kinkFitIndices
        .map((i) => curve.fitPoints.length - 1 - i)
        .sort((a, b) => a - b);
    const negate = (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, z: -v.z });
    if (curve.endTangent) reversed.startTangent = negate(curve.endTangent);
    if (curve.startTangent) reversed.endTangent = negate(curve.startTangent);
  }
  return reversed;
}
export function plainPolyline(entity: CadEntity): CadPolyline | undefined {
  const curve = editCurve(entity);
  if (curve?.type === 'LWPOLYLINE' || curve?.type === 'POLYLINE')
    return editCurveEntity(entity, curve) as CadPolyline;
  if (curve?.type === 'LINE' || curve?.type === 'ARC')
    return editCurveEntity(entity, polylineCurve([curve])) as CadPolyline;
  return;
}
