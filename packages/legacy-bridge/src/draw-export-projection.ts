import {
  geometryBounds,
  geometryEvaluation,
  helixBreakpoints,
  splineBreakpoints,
} from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadBounds, CadEntity, CadPoint } from './types';

function breaks(curve: CurveGeometry): number[] {
  if (curve.type === 'TRANSFORMED') return breaks(curve.source);
  if (curve.type === 'HELIX') return helixBreakpoints(curve);
  if (curve.type === 'SPLINE') return splineBreakpoints(curve);
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    const count = curve.vertices.length - (curve.closed ? 0 : 1);
    return Array.from({ length: count + 1 }, (_, i) => i / count);
  }
  return [0, 0.25, 0.5, 0.75, 1];
}
/** Output sampling follows the actual WCS curve rather than its compatibility control polygon. */
export function exportCurvePoints(
  curve: CurveGeometry,
  tolerance?: number,
  clip?: CadBounds,
): CadPoint[] {
  const bounds = geometryBounds(curve);
  if (bounds.kind === 'unbounded') {
    if (curve.type !== 'RAY' && curve.type !== 'XLINE')
      throw new Error('Unsupported unbounded export.');
    const window = clip ?? {
      minX: curve.basePoint.x - 50,
      maxX: curve.basePoint.x + 50,
      minY: -curve.basePoint.y - 50,
      maxY: -curve.basePoint.y + 50,
    };
    let low = curve.type === 'RAY' ? 0 : -Infinity,
      high = Infinity;
    const axes: readonly (readonly [number, number, number, number])[] = [
      [curve.basePoint.x, curve.direction.x, window.minX, window.maxX],
      [-curve.basePoint.y, -curve.direction.y, window.minY, window.maxY],
    ];
    for (const [base, direction, min, max] of axes) {
      if (Math.abs(direction) < 1e-15) {
        if (base < min || base > max) return [];
        continue;
      }
      const a = (min - base) / direction,
        b = (max - base) / direction;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
    if (low > high) return [];
    if (!Number.isFinite(low) || !Number.isFinite(high)) low = high = 0;
    const at = (t: number) => ({
      x: curve.basePoint.x + curve.direction.x * t,
      y: -curve.basePoint.y - curve.direction.y * t,
      z: curve.basePoint.z + curve.direction.z * t,
    });
    return [at(low), at(high)];
  }
  const error =
    tolerance ??
    Math.max(1e-6, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 16384);
  const at = (t: number): CadPoint => {
    const p = geometryEvaluation(curve, t).point;
    return { x: p.x, y: -p.y, z: p.z };
  };
  const result = [at(0)];
  const visit = (a: number, b: number, start: CadPoint, end: CadPoint, depth: number): void => {
    const middle = (a + b) / 2,
      mid = at(middle);
    let delta = 0;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const p = fraction === 0.5 ? mid : at(a + (b - a) * fraction);
      delta = Math.max(
        delta,
        Math.hypot(
          p.x - start.x - (end.x - start.x) * fraction,
          p.y - start.y - (end.y - start.y) * fraction,
        ),
      );
    }
    if (delta <= error || depth >= 24 || result.length >= 65536) result.push(end);
    else {
      visit(a, middle, start, mid, depth + 1);
      visit(middle, b, mid, end, depth + 1);
    }
  };
  const seeds = breaks(curve);
  for (let i = 1; i < seeds.length; i++) {
    const a = seeds[i - 1]!,
      b = seeds[i]!;
    for (let j = 0; j < 4; j++) {
      const low = a + ((b - a) * j) / 4,
        high = a + ((b - a) * (j + 1)) / 4;
      visit(low, high, result.at(-1)!, at(high), 0);
    }
  }
  return result;
}
export function exportEntityPaths(
  entity: CadEntity,
  tolerance?: number,
  bounds?: CadBounds,
): CadPoint[][] | undefined {
  if (entity.drawPaths) return entity.drawPaths;
  if (entity.regionLoops)
    return entity.regionLoops.map((loop) =>
      loop.flatMap((curve) => exportCurvePoints(curve, tolerance)),
    );
  if (entity.curve) return [exportCurvePoints(entity.curve, tolerance, bounds)];
  return undefined;
}
export function exportEntityBounds(entity: CadEntity): CadBounds | undefined {
  const curveBounds = entity.curve ? geometryBounds(entity.curve) : undefined;
  if (curveBounds?.kind === 'finite')
    return {
      minX: curveBounds.min.x,
      minY: -curveBounds.max.y,
      maxX: curveBounds.max.x,
      maxY: -curveBounds.min.y,
    };
  const points = [
    ...(entity.drawFill ?? []),
    ...(entity.drawPaths ?? []),
    ...(entity.regionLoops?.map((loop) => loop.flatMap((curve) => exportCurvePoints(curve))) ?? []),
  ].flat();
  if (!points.length) {
    if (entity.curve?.type !== 'XLINE' && entity.curve?.type !== 'RAY') return undefined;
    const p = entity.curve.basePoint;
    return { minX: p.x - 50, minY: -p.y - 50, maxX: p.x + 50, maxY: -p.y + 50 };
  }
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    result.minX = Math.min(result.minX, p.x);
    result.minY = Math.min(result.minY, p.y);
    result.maxX = Math.max(result.maxX, p.x);
    result.maxY = Math.max(result.maxY, p.y);
  }
  return result;
}
