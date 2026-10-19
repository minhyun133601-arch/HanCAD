import { geometryEvaluation, polylineSegments } from '@hancad/geom';
import type { PolylineGeometry } from '@hancad/geom';
import type { CadEntity, CadPoint } from './types';
import { exportCurvePoints } from './draw-export-projection';

export function exportPolylineCurve(entity: CadEntity): PolylineGeometry | undefined {
  if (entity.curve?.type === 'LWPOLYLINE' || entity.curve?.type === 'POLYLINE') return entity.curve;
  if (entity.type !== 'polyline' && entity.type !== 'rect') return undefined;
  if (
    !entity.startWidths?.some(Boolean) &&
    !entity.endWidths?.some(Boolean) &&
    !entity.constantWidth
  )
    return undefined;
  return {
    type: 'LWPOLYLINE',
    closed: entity.closed,
    is3D: false,
    normal: { x: 0, y: 0, z: 1 },
    constantWidth: entity.constantWidth ?? 0,
    vertices: entity.points.map((p, i) => ({
      position: { x: p.x, y: -p.y, z: p.z ?? entity.elevation ?? 0 },
      bulge: -(entity.bulges?.[i] ?? 0),
      startWidth: entity.startWidths?.[i] ?? entity.constantWidth ?? 0,
      endWidth: entity.endWidths?.[i] ?? entity.constantWidth ?? 0,
    })),
  };
}
/** Widths are object-space lengths; output tessellation preserves taper and curved boundaries. */
export function exportWidthFills(entity: CadEntity, tolerance?: number): CadPoint[][] | undefined {
  const curve = exportPolylineCurve(entity);
  if (
    !curve ||
    curve.is3D ||
    !curve.vertices.some((vertex) => vertex.startWidth || vertex.endWidth)
  )
    return undefined;
  const polygons: CadPoint[][] = [];
  for (const segment of polylineSegments(curve)) {
    if (!segment.startWidth && !segment.endWidth) continue;
    const centerline = exportCurvePoints(segment.geometry, tolerance),
      left: CadPoint[] = [],
      right: CadPoint[] = [];
    for (let i = 0; i < centerline.length; i++) {
      const t = i / (centerline.length - 1),
        p = centerline[i]!,
        derivative = geometryEvaluation(segment.geometry, t).derivative;
      const length = Math.hypot(derivative.x, derivative.y),
        width = (segment.startWidth + (segment.endWidth - segment.startWidth) * t) / 2;
      const nx = length ? -derivative.y / length : 0,
        ny = length ? -derivative.x / length : 0;
      left.push({ x: p.x + nx * width, y: p.y + ny * width });
      right.push({ x: p.x - nx * width, y: p.y - ny * width });
    }
    polygons.push([...left, ...right.reverse()]);
  }
  return polygons;
}
export function exportThinPaths(entity: CadEntity, tolerance?: number): CadPoint[][] {
  const curve = exportPolylineCurve(entity);
  return curve
    ? polylineSegments(curve)
        .filter((segment) => !segment.startWidth && !segment.endWidth)
        .map((segment) => exportCurvePoints(segment.geometry, tolerance))
    : [];
}
