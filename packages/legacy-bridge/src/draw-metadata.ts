import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity, CadPolyline, LegacyCadState } from './types';
import { validDrawPoint, validateDrawCurve } from './draw-geometry-validation';

function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value))
    return value.length <= 100000 && value.every((item: unknown) => finiteTree(item, depth + 1));
  return (
    typeof value === 'object' && Object.values(value).every((item) => finiteTree(item, depth + 1))
  );
}
const curveTypes = new Set([
  'POINT',
  'LINE',
  'CIRCLE',
  'ARC',
  'ELLIPSE',
  'SPLINE',
  'HELIX',
  'XLINE',
  'RAY',
  'LWPOLYLINE',
  'POLYLINE',
  'TRANSFORMED',
]);

/** Exact source geometry is validated before crossing recovery/clipboard boundaries. */
export function restoreDrawMetadata(
  state: Pick<LegacyCadState, 'entities' | 'mlineStyles'>,
  raw: { entities: unknown[]; mlineStyles?: unknown },
): void {
  if (raw.mlineStyles !== undefined) {
    if (
      !Array.isArray(raw.mlineStyles) ||
      !raw.mlineStyles.every((style: unknown) => {
        if (!style || typeof style !== 'object') return false;
        const record = style as Record<string, unknown>;
        return (
          typeof record.name === 'string' &&
          record.name.length > 0 &&
          record.name.length <= 255 &&
          typeof record.description === 'string' &&
          Array.isArray(record.offsets) &&
          record.offsets.length >= 1 &&
          record.offsets.length <= 16 &&
          record.offsets.every(
            (offset: unknown) => typeof offset === 'number' && Number.isFinite(offset),
          )
        );
      })
    )
      throw new Error('Invalid multiline styles.');
    state.mlineStyles = structuredClone(raw.mlineStyles) as NonNullable<
      LegacyCadState['mlineStyles']
    >;
  }
  for (let i = 0; i < state.entities.length; i++) {
    const source = raw.entities[i];
    const target = state.entities[i]!;
    if (typeof source !== 'object' || source === null) throw new Error('Invalid drawing entity.');
    const record = source as Record<string, unknown>;
    if (record.peditTangents !== undefined) {
      const tangents = record.peditTangents;
      if (
        !tangents ||
        typeof tangents !== 'object' ||
        Array.isArray(tangents) ||
        !Object.entries(tangents).every(
          ([key, value]) =>
            /^\d+$/.test(key) && typeof value === 'number' && Number.isFinite(value),
        )
      )
        throw new Error('Invalid polyline vertex tangents.');
      target.peditTangents = structuredClone(tangents) as Record<string, number>;
    }
    for (const key of ['material', 'plotStyle'] as const) {
      const value = record[key];
      if (value !== undefined) {
        if (typeof value !== 'string' || !value || value.length > 255)
          throw new Error(`Invalid entity ${key}.`);
        target[key] = value;
      }
    }
    if (record.annotative !== undefined) {
      if (typeof record.annotative !== 'boolean') throw new Error('Invalid annotative flag.');
      target.annotative = record.annotative;
    }
    if (record.thickness !== undefined) {
      if (typeof record.thickness !== 'number' || !Number.isFinite(record.thickness))
        throw new Error('Invalid entity thickness.');
      target.thickness = record.thickness;
    }
    if (record.sourceType !== undefined) {
      if (typeof record.sourceType !== 'string' || !/^[A-Z0-9_]{1,32}$/.test(record.sourceType))
        throw new Error('Invalid drawing source type.');
      target.sourceType = record.sourceType;
    }
    if (record.curve !== undefined) {
      const curve = record.curve as CurveGeometry;
      if (!curve || !curveTypes.has(curve.type) || !finiteTree(curve))
        throw new Error('Invalid exact drawing geometry.');
      validateDrawCurve(curve);
      target.curve = structuredClone(curve);
    }
    if (target.type === 'polyline' || target.type === 'rect') restoreWidths(target, record);
    if (record.drawFill !== undefined) {
      if (
        !Array.isArray(record.drawFill) ||
        !finiteTree(record.drawFill) ||
        !record.drawFill.every(
          (polygon: unknown) =>
            Array.isArray(polygon) &&
            polygon.length >= 3 &&
            polygon.every(
              (point: unknown) =>
                typeof point === 'object' &&
                point !== null &&
                'x' in point &&
                'y' in point &&
                typeof point.x === 'number' &&
                typeof point.y === 'number',
            ),
        )
      )
        throw new Error('Invalid drawing fill.');
      target.drawFill = structuredClone(record.drawFill) as NonNullable<CadEntity['drawFill']>;
    }
    if (record.frameMode !== undefined) {
      if (![0, 1, 2].includes(Number(record.frameMode)))
        throw new Error('Invalid drawing frame mode.');
      target.frameMode = Number(record.frameMode);
    }
    if (record.drawPaths !== undefined) {
      if (
        !Array.isArray(record.drawPaths) ||
        !finiteTree(record.drawPaths) ||
        !record.drawPaths.every(
          (path: unknown) => Array.isArray(path) && path.length >= 2 && path.every(validDrawPoint),
        )
      )
        throw new Error('Invalid multiline display paths.');
      target.drawPaths = structuredClone(record.drawPaths) as NonNullable<CadEntity['drawPaths']>;
    }
    if (record.mline !== undefined) {
      const data = record.mline as NonNullable<CadEntity['mline']>;
      if (
        !data ||
        !finiteTree(data) ||
        !Array.isArray(data.vertices) ||
        data.vertices.length < 2 ||
        !data.vertices.every(validDrawPoint) ||
        !Array.isArray(data.offsets) ||
        !data.offsets.length ||
        !data.offsets.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
        typeof data.style !== 'string' ||
        typeof data.closed !== 'boolean' ||
        typeof data.scale !== 'number' ||
        ![0, 1, 2].includes(data.justification)
      )
        throw new Error('Invalid multiline definition.');
      target.mline = structuredClone(data);
    }
    if (record.regionLoops !== undefined) {
      if (
        !Array.isArray(record.regionLoops) ||
        !finiteTree(record.regionLoops) ||
        !record.regionLoops.every(
          (loop: unknown) =>
            Array.isArray(loop) &&
            loop.length > 0 &&
            loop.every((curve: CurveGeometry) => {
              if (!curveTypes.has(curve.type)) return false;
              validateDrawCurve(curve);
              return true;
            }),
        )
      )
        throw new Error('Invalid region boundary.');
      target.regionLoops = structuredClone(record.regionLoops) as NonNullable<
        CadEntity['regionLoops']
      >;
      if (
        typeof record.regionArea !== 'number' ||
        !Number.isFinite(record.regionArea) ||
        record.regionArea <= 0
      )
        throw new Error('Invalid region area.');
      target.regionArea = record.regionArea;
    }
    if (record.cloudVertices !== undefined) {
      if (
        !Array.isArray(record.cloudVertices) ||
        record.cloudVertices.length < 2 ||
        !finiteTree(record.cloudVertices) ||
        !record.cloudVertices.every(
          (point: unknown) =>
            point !== null &&
            typeof point === 'object' &&
            'x' in point &&
            'y' in point &&
            typeof point.x === 'number' &&
            typeof point.y === 'number',
        )
      )
        throw new Error('Invalid revision cloud boundary.');
      if (
        typeof record.cloudArcLength !== 'number' ||
        !Number.isFinite(record.cloudArcLength) ||
        record.cloudArcLength <= 0 ||
        !['Normal', 'Calligraphy'].includes(String(record.cloudStyle))
      )
        throw new Error('Invalid revision cloud settings.');
      target.cloudVertices = structuredClone(record.cloudVertices) as NonNullable<
        CadEntity['cloudVertices']
      >;
      target.cloudArcLength = record.cloudArcLength;
      target.cloudStyle = record.cloudStyle as NonNullable<CadEntity['cloudStyle']>;
      if (record.cloudVariance !== undefined && typeof record.cloudVariance !== 'boolean')
        throw new Error('Invalid revision cloud variance.');
      if (typeof record.cloudVariance === 'boolean') target.cloudVariance = record.cloudVariance;
    }
  }
}
function restoreWidths(target: CadPolyline, record: Record<string, unknown>): void {
  for (const key of ['constantWidth', 'elevation', 'thickness'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (key === 'constantWidth' && value < 0)
    )
      throw new Error('Invalid polyline width/elevation.');
    target[key] = value;
  }
  for (const key of ['startWidths', 'endWidths'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (
      !Array.isArray(value) ||
      value.length !== target.points.length ||
      !value.every(
        (width: unknown) => typeof width === 'number' && Number.isFinite(width) && width >= 0,
      )
    )
      throw new Error('Invalid polyline vertex widths.');
    target[key] = [...value] as number[];
  }
}
