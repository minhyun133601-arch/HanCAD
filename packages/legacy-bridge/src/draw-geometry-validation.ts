import { geometryBounds, geometryEvaluation, resolveSpline } from '@hancad/geom';
import type { CurveGeometry, Vec3 } from '@hancad/geom';

export function validDrawPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === 'number' &&
    Number.isFinite(record.x) &&
    typeof record.y === 'number' &&
    Number.isFinite(record.y) &&
    (record.z === undefined || (typeof record.z === 'number' && Number.isFinite(record.z)))
  );
}
const vector = (p: Vec3) => validDrawPoint(p) && typeof p.z === 'number' && Number.isFinite(p.z);
const nonzero = (p: Vec3) => vector(p) && Math.hypot(p.x, p.y, p.z) > 0;
const positive = (n: number) => Number.isFinite(n) && n > 0;
export function validateDrawCurve(curve: CurveGeometry, depth = 0): void {
  if (!curve || depth > 8) throw new Error('Invalid exact drawing geometry.');
  let valid = false;
  switch (curve.type) {
    case 'POINT':
      valid = vector(curve.position);
      break;
    case 'LINE':
      valid = vector(curve.start) && vector(curve.end);
      break;
    case 'XLINE':
    case 'RAY':
      valid = vector(curve.basePoint) && nonzero(curve.direction);
      break;
    case 'CIRCLE':
    case 'ARC':
      valid =
        vector(curve.center) &&
        nonzero(curve.normal) &&
        nonzero(curve.xAxis) &&
        positive(curve.radius) &&
        (curve.type === 'CIRCLE' ||
          (Number.isFinite(curve.startAngle) &&
            Number.isFinite(curve.sweepAngle) &&
            curve.sweepAngle !== 0));
      break;
    case 'ELLIPSE':
      valid =
        vector(curve.center) &&
        nonzero(curve.majorAxis) &&
        nonzero(curve.minorAxis) &&
        Number.isFinite(curve.startParameter) &&
        Number.isFinite(curve.sweepParameter) &&
        curve.sweepParameter !== 0;
      break;
    case 'SPLINE':
      valid =
        Array.isArray(curve.fitPoints) &&
        Array.isArray(curve.controlPoints) &&
        curve.fitPoints.every(vector) &&
        curve.controlPoints.every(vector) &&
        Array.isArray(curve.weights) &&
        Array.isArray(curve.knots) &&
        curve.fitTolerance >= 0 &&
        typeof curve.closed === 'boolean' &&
        typeof curve.periodic === 'boolean';
      if (valid) resolveSpline(curve);
      break;
    case 'LWPOLYLINE':
    case 'POLYLINE':
      valid =
        Array.isArray(curve.vertices) &&
        curve.vertices.length >= 2 &&
        curve.vertices.every(
          (v) =>
            vector(v.position) && Number.isFinite(v.bulge) && v.startWidth >= 0 && v.endWidth >= 0,
        ) &&
        nonzero(curve.normal) &&
        curve.constantWidth >= 0;
      break;
    case 'HELIX':
      valid =
        vector(curve.center) &&
        nonzero(curve.normal) &&
        nonzero(curve.xAxis) &&
        curve.baseRadius >= 0 &&
        curve.topRadius >= 0 &&
        (curve.baseRadius > 0 || curve.topRadius > 0) &&
        positive(curve.turns) &&
        curve.turns <= 500 &&
        Number.isFinite(curve.height) &&
        Number.isFinite(curve.startAngle) &&
        typeof curve.clockwise === 'boolean';
      break;
    case 'TRANSFORMED':
      validateDrawCurve(curve.source, depth + 1);
      valid =
        Array.isArray(curve.matrix) &&
        curve.matrix.length === 12 &&
        curve.matrix.every(Number.isFinite);
      break;
  }
  if (!valid) throw new Error('Invalid exact drawing geometry.');
  geometryBounds(curve);
  const sample = geometryEvaluation(curve, 0.5).point;
  if (!vector(sample)) throw new Error('Invalid exact drawing geometry.');
}
