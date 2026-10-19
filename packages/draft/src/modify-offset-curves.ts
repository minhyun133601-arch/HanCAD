import {
  closestGeometryPoint,
  evaluateGeometry,
  geometryEvaluation,
  splineBreakpoints,
  type CurveGeometry,
  type SplineGeometry,
  type Vec3,
} from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { model, wcs } from './draw-curve-helpers';
import { offsetCadEntity, type OffsetGeometryOptions } from './offset-geometry';
import { offsetPolylineKernel } from './modify-offset-polyline';
import { trimmedSplineOffsets } from './modify-offset-spline-trim';

const offsetTolerance = 1e-6;
const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** A regular parallel of an ellipse/NURBS is generally not itself a rational B-spline.
 * Fit piecewise cubic Beziers with quarter/midpoint residual checks to an explicit mm tolerance. */
export function offsetSpline(
  curve: CurveGeometry,
  point: CadPoint,
  distanceValue: number,
  interval?: readonly [number, number],
): SplineGeometry {
  const pick = wcs(point),
    near = closestGeometryPoint(curve, pick),
    evalNear = geometryEvaluation(curve, near.parameter);
  const d = evalNear.derivative,
    speed = Math.hypot(d.x, d.y);
  if (speed < 1e-12) throw new Error('Curve has a singular tangent.');
  const side = (-d.y * (pick.x - near.point.x) + d.x * (pick.y - near.point.y)) / speed;
  const offset = distanceValue < 0 ? side : Math.sign(side) * distanceValue;
  if (Math.abs(offset) < 1e-10) throw new Error('Ambiguous offset side.');
  const sample = (t: number): { point: Vec3; derivative: Vec3 } => {
    const e = geometryEvaluation(curve, t),
      v = e.derivative,
      length = Math.hypot(v.x, v.y),
      h = 1e-5;
    if (length < 1e-12) throw new Error('Curve has a singular tangent.');
    const lo = Math.max(0, t - h),
      hi = Math.min(1, t + h),
      a = geometryEvaluation(curve, lo).derivative,
      b = geometryEvaluation(curve, hi).derivative;
    const ax = (b.x - a.x) / (hi - lo),
      ay = (b.y - a.y) / (hi - lo),
      curvature = (v.x * ay - v.y * ax) / length ** 3,
      factor = 1 - offset * curvature;
    if (factor <= 1e-8) throw new Error('Offset crosses a curvature cusp.');
    return {
      point: {
        x: e.point.x - (offset * v.y) / length,
        y: e.point.y + (offset * v.x) / length,
        z: e.point.z,
      },
      derivative: { x: v.x * factor, y: v.y * factor, z: v.z },
    };
  };
  const controls: Vec3[] = [],
    ends: number[] = [];
  const fit = (lo: number, hi: number, depth: number): void => {
    const a = sample(lo),
      b = sample(hi),
      span = hi - lo;
    const bezier = [
      a.point,
      {
        x: a.point.x + (a.derivative.x * span) / 3,
        y: a.point.y + (a.derivative.y * span) / 3,
        z: a.point.z + (a.derivative.z * span) / 3,
      },
      {
        x: b.point.x - (b.derivative.x * span) / 3,
        y: b.point.y - (b.derivative.y * span) / 3,
        z: b.point.z - (b.derivative.z * span) / 3,
      },
      b.point,
    ];
    const at = (t: number): Vec3 => {
      const u = 1 - t,
        w = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
      return {
        x: w.reduce((s, k, i) => s + k * bezier[i]!.x, 0),
        y: w.reduce((s, k, i) => s + k * bezier[i]!.y, 0),
        z: w.reduce((s, k, i) => s + k * bezier[i]!.z, 0),
      };
    };
    const error = Math.max(
      ...[0.2, 0.4, 0.6, 0.8].map((t) => distance3(at(t), sample(lo + t * span).point)),
    );
    if (error > offsetTolerance) {
      if (depth >= 16 || controls.length > 60000)
        throw new Error('Offset spline tolerance could not be satisfied.');
      fit(lo, (lo + hi) / 2, depth + 1);
      fit((lo + hi) / 2, hi, depth + 1);
      return;
    }
    controls.push(...(controls.length ? bezier.slice(1) : bezier));
    ends.push(hi);
  };
  const lo = interval?.[0] ?? 0,
    hi = interval?.[1] ?? 1;
  const breaks = [
    lo,
    ...(curve.type === 'SPLINE' ? splineBreakpoints(curve) : [0, 0.25, 0.5, 0.75, 1]).filter(
      (t) => t > lo && t < hi,
    ),
    hi,
  ];
  for (let i = 1; i < breaks.length; i++) fit(breaks[i - 1]!, breaks[i]!, 0);
  const knots = [
    0,
    0,
    0,
    0,
    ...ends
      .slice(0, -1)
      .flatMap((t) => [(t - lo) / (hi - lo), (t - lo) / (hi - lo), (t - lo) / (hi - lo)]),
    1,
    1,
    1,
    1,
  ];
  const closed = distance3(evaluateGeometry(curve, lo), evaluateGeometry(curve, hi)) < 1e-7;
  return {
    type: 'SPLINE',
    degree: 3,
    knots,
    controlPoints: controls,
    weights: controls.map(() => 1),
    fitPoints: [],
    closed,
    periodic: false,
    fitTolerance: offsetTolerance,
    knotParameterization: 'uniform',
  };
}
export function offsetModifyEntity(entity: CadEntity, options: OffsetGeometryOptions): CadEntity[] {
  if (entity.curve?.type === 'ELLIPSE' || entity.curve?.type === 'SPLINE') {
    const curves = trimmedSplineOffsets(
      entity.curve,
      options.point,
      options.distance,
      offsetSpline,
    );
    return curves.map((curve, index) => {
      const output: CadEntity = {
        ...entity,
        id: index ? `${options.id}-${index}` : options.id,
        layer: options.layer ?? entity.layer,
        type: 'polyline',
        points: curve.controlPoints.map(model),
        closed: curve.closed,
        curve,
        sourceType: 'SPLINE',
      };
      if (output.type === 'polyline') {
        delete output.startWidths;
        delete output.endWidths;
        delete output.bulges;
        delete output.constantWidth;
      }
      return output;
    });
  }
  if (entity.curve?.type === 'XLINE' || entity.curve?.type === 'RAY') {
    const source = entity.curve,
      d = source.direction,
      speed = Math.hypot(d.x, d.y),
      pick = wcs(options.point),
      side = (-d.y * (pick.x - source.basePoint.x) + d.x * (pick.y - source.basePoint.y)) / speed;
    const value = options.distance < 0 ? side : Math.sign(side) * options.distance;
    if (Math.abs(value) < 1e-10) throw new Error('Ambiguous offset side.');
    const basePoint = {
      ...source.basePoint,
      x: source.basePoint.x - (d.y * value) / speed,
      y: source.basePoint.y + (d.x * value) / speed,
    };
    return [
      {
        ...entity,
        id: options.id,
        layer: options.layer ?? entity.layer,
        curve: { ...source, basePoint },
        ...(entity.type === 'polyline'
          ? {
              points: [
                model(basePoint),
                model({ x: basePoint.x + d.x, y: basePoint.y + d.y, z: basePoint.z + d.z }),
              ],
            }
          : {}),
      },
    ];
  }
  if (entity.type === 'polyline' || entity.type === 'rect')
    return offsetPolylineKernel(
      entity,
      options.point,
      options.distance,
      options.gapType,
      options.id,
      options.layer,
    );
  const result = offsetCadEntity(entity, options);
  if ('error' in result) throw new Error(result.error);
  const shifted = result.entity;
  if (
    (shifted.type === 'circle' || shifted.type === 'arc') &&
    (shifted.curve?.type === 'CIRCLE' || shifted.curve?.type === 'ARC')
  )
    shifted.curve = { ...shifted.curve, radius: shifted.radius };
  if (shifted.type === 'line' && shifted.curve?.type === 'LINE')
    shifted.curve = { type: 'LINE', start: wcs(shifted.a), end: wcs(shifted.b) };
  return [shifted];
}
