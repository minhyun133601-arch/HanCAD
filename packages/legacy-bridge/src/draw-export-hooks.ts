import { exportCurvePoints, exportEntityBounds, exportEntityPaths } from './draw-export-projection';
import { validateDrawingDxf, writeDrawingDxf } from './draw-export-dxf';
import { drawingEntityMetadata, importDrawingMetadata } from './draw-export-metadata';
import { restoreDrawMetadata } from './draw-metadata';
import { cross3, scale3 } from '@hancad/geom';
import { exportPolylineCurve, exportThinPaths, exportWidthFills } from './draw-export-widths';
import type { CadBounds, CadEntity, CadPoint } from './types';
import type { DrawingExportHooks } from './draw-export-types';
import { nativeGeometrySignatures } from './draw-export-signature';
import { importSplinePolyline } from './draw-import-spline';
import { drawingExportStyle, drawingLinetypes } from './draw-export-style';

function fillPaths(entity: CadEntity, tolerance?: number): CadPoint[][] | undefined {
  return entity.drawFill ?? exportWidthFills(entity, tolerance);
}
const xy = (p: CadPoint): string => `${p.x},${p.y}`;
function path(polygon: readonly CadPoint[], close = false): string {
  return polygon.length
    ? `M${xy(polygon[0]!)} ${polygon
        .slice(1)
        .map((p) => `L${xy(p)}`)
        .join(' ')}${close ? ' Z' : ''}`
    : '';
}
function conicSvg(entity: CadEntity): string | undefined {
  const curve = entity.curve;
  if (!curve || !['ELLIPSE', 'CIRCLE', 'ARC'].includes(curve.type)) return undefined;
  if (curve.type !== 'ELLIPSE' && curve.type !== 'CIRCLE' && curve.type !== 'ARC') return undefined;
  const major = curve.type === 'ELLIPSE' ? curve.majorAxis : scale3(curve.xAxis, curve.radius);
  const minor =
    curve.type === 'ELLIPSE'
      ? curve.minorAxis
      : scale3(cross3(curve.normal, curve.xAxis), curve.radius);
  const matrix = `matrix(${major.x} ${-major.y} ${minor.x} ${-minor.y} ${curve.center.x} ${-curve.center.y})`;
  const start =
    curve.type === 'ELLIPSE' ? curve.startParameter : curve.type === 'ARC' ? curve.startAngle : 0;
  const sweep =
    curve.type === 'ELLIPSE'
      ? curve.sweepParameter
      : curve.type === 'ARC'
        ? curve.sweepAngle
        : 2 * Math.PI;
  if (Math.abs(sweep) >= 2 * Math.PI - 1e-12)
    return `<circle cx="0" cy="0" r="1" transform="${matrix}" vector-effect="non-scaling-stroke"/>`;
  return `<path transform="${matrix}" d="M${Math.cos(start)},${Math.sin(start)} A1,1 0 ${Math.abs(sweep) > Math.PI ? 1 : 0},${sweep > 0 ? 1 : 0} ${Math.cos(start + sweep)},${Math.sin(start + sweep)}" vector-effect="non-scaling-stroke"/>`;
}
export const drawingExportHooks: DrawingExportHooks = {
  style: drawingExportStyle,
  linetypes: drawingLinetypes,
  bounds: (entity) => {
    const exact = exportEntityBounds(entity),
      fills = exportWidthFills(entity);
    if (!fills?.length) return exact;
    const points = fills.flat(),
      result = exact ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of points) {
      result.minX = Math.min(result.minX, p.x);
      result.minY = Math.min(result.minY, p.y);
      result.maxX = Math.max(result.maxX, p.x);
      result.maxY = Math.max(result.maxY, p.y);
    }
    return result;
  },
  dxf: writeDrawingDxf,
  validateDxf: validateDrawingDxf,
  metadata: drawingEntityMetadata,
  signatures: nativeGeometrySignatures,
  splinePolyline: importSplinePolyline,
  importMetadata: importDrawingMetadata,
  restore: restoreDrawMetadata,
  svg: (entity, bounds) => {
    const conic = conicSvg(entity);
    if (conic) return conic;
    const widthCurve = exportPolylineCurve(entity);
    const paths =
        exportEntityPaths(entity, undefined, bounds) ??
        (widthCurve ? [exportCurvePoints(widthCurve)] : undefined),
      fills = fillPaths(entity);
    if (!paths && !fills) return undefined;
    const result: string[] = [];
    if (fills?.length) {
      const wipeout = entity.sourceType === 'WIPEOUT';
      result.push(
        `<path d="${fills.map((p) => path(p, true)).join(' ')}" fill="${wipeout ? '#ffffff' : 'currentColor'}"${wipeout ? ' stroke="none"' : ''} fill-rule="evenodd"/>`,
      );
      if (wipeout && entity.frameMode !== 1) return result.join('');
    }
    const strokes = fills?.length ? (widthCurve ? exportThinPaths(entity) : []) : (paths ?? []);
    for (const points of strokes)
      result.push(`<path d="${path(points)}" vector-effect="non-scaling-stroke"/>`);
    if (entity.sourceType === 'WIPEOUT' && entity.frameMode === 1)
      for (const points of fills ?? [])
        result.push(`<path d="${path(points, true)}" vector-effect="non-scaling-stroke"/>`);
    return result.join('');
  },
  draw: (context, entity, options) => {
    const tolerance = 0.2 / Math.max(1e-9, options.scale ?? 1),
      widthCurve = exportPolylineCurve(entity);
    const paths =
        exportEntityPaths(
          entity,
          tolerance,
          entity.curve?.type === 'XLINE' || entity.curve?.type === 'RAY'
            ? canvasBounds(context)
            : undefined,
        ) ?? (widthCurve ? [exportCurvePoints(widthCurve, tolerance)] : undefined),
      fills = fillPaths(entity, tolerance);
    if (!paths && !fills) return false;
    const trace = (points: CadPoint[], close = false): void => {
      if (!points.length) return;
      context.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) context.lineTo(p.x, p.y);
      if (close) context.closePath();
    };
    if (fills?.length) {
      context.beginPath();
      for (const polygon of fills) trace(polygon, true);
      if (entity.sourceType === 'WIPEOUT') {
        const fill = context.fillStyle;
        context.fillStyle = '#ffffff';
        context.fill('evenodd');
        context.fillStyle = fill;
        if (entity.frameMode === 1) context.stroke();
      } else context.fill('evenodd');
    }
    if (entity.sourceType !== 'WIPEOUT') {
      const strokes = fills?.length
        ? widthCurve
          ? exportThinPaths(entity, tolerance)
          : []
        : (paths ?? []);
      context.beginPath();
      for (const points of strokes) trace(points);
      context.stroke();
    }
    return true;
  },
};
function canvasBounds(context: CanvasRenderingContext2D): CadBounds | undefined {
  if (typeof context.getTransform !== 'function' || !context.canvas) return undefined;
  const transform = context.getTransform();
  if (!transform || typeof transform.inverse !== 'function') return undefined;
  const inverse = transform.inverse(),
    points = [
      [0, 0],
      [context.canvas.width, 0],
      [context.canvas.width, context.canvas.height],
      [0, context.canvas.height],
    ].map(([x, y]) => inverse.transformPoint({ x: x!, y: y! }));
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
