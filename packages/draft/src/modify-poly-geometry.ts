import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { evaluateGeometry } from '@hancad/geom';
import { model } from './draw-curve-helpers';
import { splineFromPoints } from './draw-spline';
import { editCurveEntity, plainPolyline } from './modify-curve-geometry';
import { tangentBulge } from './draw-pline-geometry';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { threePointSegment } from './draw-pline-geometry';

const unit = (p: CadPoint): CadPoint => {
  const n = Math.hypot(p.x, p.y);
  return n ? { x: p.x / n, y: p.y / n } : { x: 1, y: 0 };
};
export function peditFit(entity: CadPolyline, tangents = new Map<number, number>()): CadPolyline {
  const frame = entity.points,
    points: CadPoint[] = [],
    bulges: number[] = [];
  const tangent = (i: number): CadPoint => {
    const angle = tangents.get(i);
    if (angle !== undefined) return { x: Math.cos(angle), y: -Math.sin(angle) };
    const a = frame[Math.max(0, i - 1)]!,
      b = frame[Math.min(frame.length - 1, i + 1)]!;
    return unit({ x: b.x - a.x, y: b.y - a.y });
  };
  const count = entity.closed ? frame.length : frame.length - 1;
  for (let i = 0; i < count; i++) {
    const a = frame[i]!,
      b = frame[(i + 1) % frame.length]!,
      ta = tangent(i),
      tb = tangent((i + 1) % frame.length);
    const vx = b.x - a.x,
      vy = b.y - a.y,
      projection = vx * (ta.x + tb.x) + vy * (ta.y + tb.y),
      denominator = 2 * (1 - ta.x * tb.x - ta.y * tb.y);
    const distance =
      Math.abs(denominator) < 1e-10
        ? (vx * vx + vy * vy) / (2 * projection || 1)
        : (-projection + Math.sqrt(projection ** 2 + denominator * (vx * vx + vy * vy))) /
          denominator;
    const middle = {
      x: (a.x + b.x + distance * (ta.x - tb.x)) / 2,
      y: (a.y + b.y + distance * (ta.y - tb.y)) / 2,
    };
    points.push(a, middle);
    bulges.push(
      tangentBulge(a, middle, ta) ?? 0,
      -(tangentBulge(b, middle, { x: -tb.x, y: -tb.y }) ?? 0),
    );
  }
  if (!entity.closed) {
    points.push(frame.at(-1)!);
    bulges.push(0);
  }
  const proxy = { ...entity, points, bulges };
  delete proxy.curve;
  const source = legacyEntitySnapSources(proxy)[0]!.geometry;
  return {
    ...entity,
    curve: source,
    sourceType: 'POLYLINE_FIT',
    peditTangents: Object.fromEntries(tangents),
  };
}
export function peditSpline(entity: CadPolyline, type: number, segments: number): CadPolyline {
  const degree = type === 5 ? 2 : 3;
  if (entity.points.length < 2) return entity;
  const controls = [...entity.points];
  while (!entity.closed && controls.length <= degree) controls.splice(1, 0, controls[0]!);
  const spline = splineFromPoints(controls, false, degree, 2, entity.closed);
  const count = Math.max(1, Math.abs(segments)) * Math.max(1, entity.points.length - degree);
  const samples = Array.from({ length: count + (entity.closed ? 0 : 1) }, (_, i) =>
    model(evaluateGeometry(spline, i / count)),
  );
  const start = entity.startWidths?.[0] ?? entity.constantWidth ?? 0;
  const end =
    entity.endWidths?.[Math.max(0, entity.points.length - 2)] ?? entity.constantWidth ?? 0;
  const sampled: CadPolyline = {
    ...entity,
    points: samples,
    bulges: samples.map(() => 0),
    startWidths: samples.map((_, i) => start + ((end - start) * i) / count),
    endWidths: samples.map((_, i) => start + ((end - start) * Math.min(count, i + 1)) / count),
  };
  delete sampled.curve;
  const geometry =
    segments < 0 ? peditFit(sampled).curve : legacyEntitySnapSources(sampled)[0]!.geometry;
  // Retain the control frame in points; the source curve owns display/picking.
  return {
    ...entity,
    ...(geometry ? { curve: geometry } : {}),
    sourceType: degree === 2 ? 'POLYLINE_SPLINE_QUADRATIC' : 'POLYLINE_SPLINE_CUBIC',
    // Widths remain frame data so Decurve restores the original profile.
    drawPaths: [samples],
  };
}
export function decurvePolyline(entity: CadPolyline): CadPolyline {
  const result = {
    ...entity,
    type: 'polyline' as const,
    sourceType: 'LWPOLYLINE',
    bulges: entity.points.map(() => 0),
  };
  delete result.curve;
  delete result.drawPaths;
  return result;
}
export function convertPolyline(
  entity: CadEntity,
  precision: number,
  arcMode: boolean,
): CadPolyline | undefined {
  const plain = plainPolyline(entity);
  if (plain) return plain;
  if (!entity.curve || entity.curve.type !== 'SPLINE') return;
  const count = Math.max(
    2,
    (precision + 1) * Math.max(1, entity.curve.controlPoints.length - entity.curve.degree),
  );
  const points: CadPoint[] = [],
    bulges: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = model(evaluateGeometry(entity.curve, i / count)),
      b = model(evaluateGeometry(entity.curve, (i + 1) / count));
    points.push(a);
    bulges.push(
      arcMode
        ? (threePointSegment(a, model(evaluateGeometry(entity.curve, (i + 0.5) / count)), b)
            ?.bulge ?? 0)
        : 0,
    );
  }
  points.push(model(evaluateGeometry(entity.curve, 1)));
  bulges.push(0);
  const result = {
    ...editCurveEntity(entity, {
      type: 'LWPOLYLINE',
      vertices: [],
      closed: false,
      is3D: false,
      normal: { x: 0, y: 0, z: 1 },
      constantWidth: 0,
    }),
    type: 'polyline' as const,
    points,
    bulges,
    startWidths: points.map(() => 0),
    endWidths: points.map(() => 0),
    closed: entity.curve.closed,
  };
  delete result.curve;
  return result;
}
