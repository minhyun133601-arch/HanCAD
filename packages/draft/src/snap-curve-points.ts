import {
  conicComponents,
  evaluateGeometry,
  geometryEvaluation,
  geometryLength,
  transformPoint3,
} from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';
import { isClosedSnapCurve, snapCurveParts } from './snap-curves';
import type { DraftSnapKind } from './snap-types';

export interface StaticSnapPoint {
  point: Vec3;
  kind: DraftSnapKind;
  parameter?: number;
}
const tau = Math.PI * 2;
export function staticSnapPoints(curve: CurveGeometry): StaticSnapPoint[] {
  if (curve.type === 'TRANSFORMED')
    return staticSnapPoints(curve.source).map((candidate) => ({
      ...candidate,
      point: transformPoint3(curve.matrix, candidate.point),
    }));
  if (curve.type === 'POINT') return [{ point: curve.position, kind: 'node' }];
  const points: StaticSnapPoint[] = [];
  const at = (parameter: number, kind: DraftSnapKind): void => {
    points.push({ point: evaluateGeometry(curve, parameter), parameter, kind });
  };
  if (curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') {
    for (const part of snapCurveParts(curve)) points.push(...staticSnapPoints(part));
    if (curve.closed) {
      const center = snapGeometricCenter(curve);
      if (center) points.push({ point: center, kind: 'geometricCenter' });
    }
    return points;
  }
  if (curve.type === 'RAY') {
    at(0, 'endpoint');
    return points;
  }
  if (curve.type === 'XLINE') {
    at(0, 'midpoint');
    return points;
  }
  if (
    curve.type === 'LINE' ||
    curve.type === 'ARC' ||
    curve.type === 'SPLINE' ||
    (curve.type === 'ELLIPSE' && !isClosedSnapCurve(curve))
  ) {
    if (!isClosedSnapCurve(curve)) {
      at(0, 'endpoint');
      at(1, 'endpoint');
    }
    at(curve.type === 'SPLINE' ? halfLengthParameter(curve) : 0.5, 'midpoint');
  }
  if (curve.type === 'SPLINE' && curve.closed) {
    const center = snapGeometricCenter(curve);
    if (center) points.push({ point: center, kind: 'geometricCenter' });
  }
  if (curve.type === 'CIRCLE' || curve.type === 'ARC' || curve.type === 'ELLIPSE') {
    points.push({ point: curve.center, kind: 'center' });
    const { a, b, start, sweep } = conicComponents(curve);
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) =>
      curve.type !== 'ELLIPSE' && Math.abs(curve.normal.z) > 1 - 1e-12
        ? Math.atan2(
            Math.cos(angle) * b.x + Math.sin(angle) * b.y,
            Math.cos(angle) * a.x + Math.sin(angle) * a.y,
          )
        : angle,
    );
    for (const angle of angles) {
      let delta = (((Math.sign(sweep) * (angle - start)) % tau) + tau) % tau;
      if (Math.abs(delta - tau) < 1e-12) delta = 0;
      const parameter = delta / Math.abs(sweep);
      if (parameter <= 1 + 1e-12) at(Math.min(1, parameter), 'quadrant');
    }
  }
  return points;
}
function halfLengthParameter(curve: CurveGeometry): number {
  const total = geometryLength(curve);
  if (!total) return 0.5;
  let low = 0,
    high = 1;
  for (let step = 0; step < 44; step++) {
    const mid = (low + high) / 2;
    const length = integral(
      (t) => {
        const d = geometryEvaluation(curve, t).derivative;
        return Math.hypot(d.x, d.y, d.z);
      },
      0,
      mid,
      total * 1e-10,
    );
    if (length < total / 2) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
/** Signed Green integrals include bulge arcs; translating to a local origin avoids TM cancellation. */
export function snapGeometricCenter(curve: CurveGeometry): Vec3 | undefined {
  if (!isClosedSnapCurve(curve)) return;
  const origin = evaluateGeometry(curve, 0),
    parts = snapCurveParts(curve);
  let area = 0,
    mx = 0,
    my = 0;
  for (const part of parts) {
    const evaluate = (t: number) => {
      const result = geometryEvaluation(part, t);
      return { x: result.point.x - origin.x, y: result.point.y - origin.y, d: result.derivative };
    };
    area += integral(
      (t) => {
        const p = evaluate(t);
        return (p.x * p.d.y - p.y * p.d.x) / 2;
      },
      0,
      1,
      1e-9,
    );
    mx += integral(
      (t) => {
        const p = evaluate(t);
        return p.x * p.x * p.d.y;
      },
      0,
      1,
      1e-8,
    );
    my -= integral(
      (t) => {
        const p = evaluate(t);
        return p.y * p.y * p.d.x;
      },
      0,
      1,
      1e-8,
    );
  }
  if (Math.abs(area) < Number.EPSILON) return;
  return { x: origin.x + mx / (2 * area), y: origin.y + my / (2 * area), z: origin.z };
}
const nodes = [0, 0.5384693101056831, -0.5384693101056831, 0.906179845938664, -0.906179845938664];
const weights = [
  0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891,
  0.2369268850561891,
];
function integral(
  f: (t: number) => number,
  low: number,
  high: number,
  tolerance: number,
  depth = 0,
): number {
  const half = (high - low) / 2,
    mid = low + half;
  const quadrature = (a: number, b: number) => {
    const h = (b - a) / 2,
      c = a + h;
    return h * nodes.reduce((sum, node, i) => sum + weights[i]! * f(c + h * node), 0);
  };
  const whole = quadrature(low, high),
    halves = quadrature(low, mid) + quadrature(mid, high);
  if (depth >= 16 || Math.abs(whole - halves) <= tolerance * (1 + Math.abs(halves))) return halves;
  return (
    integral(f, low, mid, tolerance / 2, depth + 1) +
    integral(f, mid, high, tolerance / 2, depth + 1)
  );
}
