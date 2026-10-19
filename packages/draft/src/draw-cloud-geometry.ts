import { evaluateGeometry, geometryLength } from '@hancad/geom';
import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import type { DrawContext } from './draw-program';
import {
  length,
  offset,
  outlineDefault,
  outlinePolyline,
  unit,
  vector,
} from './draw-outline-common';
import { regionSourceCurves } from './draw-region-geometry';
import { signedPolygonArea } from './draw-wipeout';

export interface CloudOptions {
  chord: number;
  calligraphy: boolean;
  reversed?: boolean;
  variance: boolean;
}
/** Recover inward/outward sense from exact arcs so old files need no new metadata flag. */
export function cloudDirectionReversed(entity: CadEntity): boolean {
  if (entity.type !== 'polyline' && entity.type !== 'rect') return false;
  const bulge = entity.bulges?.find((value) => Math.abs(value) > 1e-12);
  if (bulge === undefined) return false;
  const boundary = entity.cloudVertices ?? entity.points;
  return Math.sign(bulge) !== (signedPolygonArea(boundary) < 0 ? -1 : 1);
}
export function cloudEntity(
  context: DrawContext,
  boundary: readonly CadPoint[],
  closed: boolean,
  options: CloudOptions,
  id?: string,
): CadPolyline {
  const points: CadPoint[] = [],
    sign = (signedPolygonArea(boundary) < 0 ? -1 : 1) * (options.reversed ? -1 : 1);
  const count = boundary.length - (closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!,
      distance = length(a, b);
    if (distance < 1e-12) continue;
    const segments = Math.max(1, Math.round(distance / options.chord)),
      direction = unit(vector(a, b));
    if (segments > 65536 || points.length + segments > 65536)
      throw new Error('Revision cloud has too many arc segments.');
    const weights = Array.from({ length: segments }, (_, j) =>
      options.variance ? (j % 2 === 0 ? 2 / 3 : 4 / 3) : 1,
    );
    const total = weights.reduce((sum, n) => sum + n, 0);
    let done = 0;
    for (let j = 0; j < segments; j++) {
      points.push(offset(a, direction, (distance * done) / total));
      done += weights[j]!;
    }
  }
  if (!closed && boundary.length) points.push({ ...boundary.at(-1)! });
  const bulge = sign * Math.tan((110 * Math.PI) / 720);
  const widths = points.map((_, i) =>
    options.calligraphy && (closed || i < points.length - 1) ? options.chord / 10 : 0,
  );
  return {
    ...outlinePolyline(
      context,
      points,
      closed,
      points.map((_, i) => (closed || i < points.length - 1 ? bulge : 0)),
      { start: points.map(() => 0), end: widths },
      id,
    ),
    sourceType: 'REVCLOUD',
    cloudVertices: boundary.map((p) => ({ ...p })),
    cloudArcLength: options.chord,
    cloudVariance: options.variance,
    cloudStyle: options.calligraphy ? 'Calligraphy' : 'Normal',
  };
}
export function cloudOptions(context: DrawContext): CloudOptions {
  const scale =
    outlineDefault(context, 'REVCLOUDSCALEMODE', 0) === 1
      ? outlineDefault(context, 'DIMSCALE', 1)
      : 1;
  const remembered = outlineDefault(context, 'REVCLOUDAPPROXARCLEN', 0);
  const initial = (context.viewDiagonal ?? 1000) / 50;
  return {
    chord: (remembered > 0 ? remembered : initial) * scale,
    calligraphy: false,
    variance: outlineDefault(context, 'REVCLOUDARCVARIANCE', 1) !== 0,
  };
}
export function cloudObjectBoundary(entity: CadEntity, chord: number): CadPoint[] | undefined {
  if (entity.sourceType === 'REGION') return undefined;
  const curves = regionSourceCurves(entity);
  if (!curves.length) return undefined;
  const first = evaluateGeometry(curves[0]!, 0),
    last = evaluateGeometry(curves.at(-1)!, 1);
  if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) > 1e-9) return undefined;
  const points = curves.flatMap((curve) => {
    const count =
      curve.type === 'LINE'
        ? 1
        : Math.max(4, Math.min(4096, Math.round(geometryLength(curve) / chord)));
    return Array.from({ length: count }, (_, i) => {
      const point = evaluateGeometry(curve, i / count);
      return { x: point.x, y: -point.y, z: point.z };
    });
  });
  return points.length >= 3 ? points : undefined;
}
