import type { CurveGeometry, Vec3 } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { parseDraftAngle, parseDraftNumber } from './coordinate-units';
import { draftEntityBase } from './entities';
import { drawPoint, type DrawContext, type DrawRequest, type DrawValue } from './draw-program';

export const TAU = Math.PI * 2;
export const positiveAngle = (angle: number): number => ((angle % TAU) + TAU) % TAU;
export const wcs = (point: CadPoint): Vec3 => ({ x: point.x, y: -point.y, z: point.z ?? 0 });
export const model = (point: Vec3): CadPoint => ({ x: point.x, y: -point.y || 0, z: point.z });
export const difference = (a: CadPoint, b: CadPoint): CadPoint => ({ x: a.x - b.x, y: a.y - b.y });
export const distance = (a: CadPoint, b: CadPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
export const middle = (a: CadPoint, b: CadPoint): CadPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export function unit(vector: CadPoint): CadPoint | undefined {
  const length = Math.hypot(vector.x, vector.y);
  return length > 0 ? { x: vector.x / length, y: vector.y / length } : undefined;
}
export function numeric(
  value: DrawValue,
  context: DrawContext,
  base?: CadPoint,
): number | undefined {
  const point = drawPoint(value);
  return point && base
    ? distance(point, base)
    : typeof value === 'string'
      ? parseDraftNumber(value, context.coordinates())
      : undefined;
}
export function heading(
  value: DrawValue,
  context: DrawContext,
  base?: CadPoint,
  included = false,
): number | undefined {
  const point = drawPoint(value);
  if (point && base) return Math.atan2(base.y - point.y, point.x - base.x);
  return typeof value === 'string'
    ? parseDraftAngle(
        value,
        included ? { ...context.coordinates(), angbase: 0, angdir: 0 } : context.coordinates(),
      )
    : undefined;
}
export function* pointInput(
  request: Omit<DrawRequest, 'kind'>,
): Generator<DrawRequest, CadPoint, DrawValue> {
  for (;;) {
    const point = drawPoint(yield { ...request, kind: 'point' });
    if (point) return point;
  }
}
export function* scalarInput(
  context: DrawContext,
  request: Omit<DrawRequest, 'kind'>,
  valid: (n: number) => boolean = (n) => n > 0,
  fallback?: number,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield { ...request, kind: 'number' };
    const number = value === '' ? fallback : numeric(value, context, request.base);
    if (number !== undefined && valid(number)) return number;
  }
}
export function curveEntity(
  context: DrawContext,
  curve: CurveGeometry,
  points: readonly CadPoint[],
  closed = false,
): CadEntity {
  return {
    ...draftEntityBase(context.settings),
    type: 'polyline',
    points: points.map((p) => ({ ...p })),
    closed,
    curve,
    sourceType: curve.type,
  };
}
export function arcEntity(
  context: DrawContext,
  center: CadPoint,
  radius: number,
  startAngle: number,
  sweepAngle: number,
): CadEntity {
  return {
    ...draftEntityBase(context.settings),
    type: 'arc',
    center: { ...center },
    radius,
    startAngle: -startAngle,
    endAngle: -startAngle - sweepAngle,
    clockwise: sweepAngle < 0,
    curve: {
      type: 'ARC',
      center: wcs(center),
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius,
      startAngle,
      sweepAngle,
    },
  };
}
export function circleThrough(
  a: CadPoint,
  b: CadPoint,
  c: CadPoint,
): { center: CadPoint; radius: number } | undefined {
  const x = b.x - a.x,
    y = b.y - a.y,
    u = c.x - a.x,
    v = c.y - a.y;
  const det = 2 * (x * v - y * u);
  if (Math.abs(det) <= Number.EPSILON * 32 * Math.hypot(x, y) * Math.hypot(u, v)) return undefined;
  const ab = x * x + y * y,
    ac = u * u + v * v;
  const dx = (ab * v - ac * y) / det,
    dy = (x * ac - u * ab) / det;
  return { center: { x: a.x + dx, y: a.y + dy }, radius: Math.hypot(dx, dy) };
}
export function pointOnCircle(center: CadPoint, radius: number, angle: number): CadPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y - radius * Math.sin(angle) };
}
export function entityDirection(
  entity: CadEntity,
): { base: CadPoint; direction: CadPoint } | undefined {
  if (entity.type === 'line') {
    const direction = unit(difference(entity.b, entity.a));
    return direction ? { base: entity.a, direction } : undefined;
  }
  if (entity.curve?.type === 'XLINE' || entity.curve?.type === 'RAY')
    return { base: model(entity.curve.basePoint), direction: model(entity.curve.direction) };
  return undefined;
}
