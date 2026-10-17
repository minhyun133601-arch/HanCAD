import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { bulgeArc } from '@hancad/geom';
import type { EntityGrip } from './grip-types';
import { gripBulgeThrough } from './grip-geometry';
import { gripArcMidpoint, gripPolylineMidpoint } from './grip-providers';

export type GripDimensionField =
  'result' | 'lengthChange' | 'absoluteAngle' | 'angleChange' | 'radius';
export interface GripDimensionContext {
  key: string;
  kind: 'linear' | 'circle' | 'arc';
  origin: CadPoint;
  original: CadPoint;
  point: CadPoint;
  originalLength: number;
  originalAngle: number;
  length: number;
  angle: number;
  radius?: number;
  start?: CadPoint;
  end?: CadPoint;
  pointerOffset?: CadPoint;
}
const length = (a: CadPoint, b: CadPoint): number => Math.hypot(b.x - a.x, b.y - a.y);
const heading = (a: CadPoint, b: CadPoint): number => Math.atan2(a.y - b.y, b.x - a.x);
const tau = Math.PI * 2;
const signedAngle = (value: number): number => ((((value + Math.PI) % tau) + tau) % tau) - Math.PI;
const linear = (
  key: string,
  origin: CadPoint,
  original: CadPoint,
  point: CadPoint,
  kind: 'linear' | 'circle' = 'linear',
): GripDimensionContext => ({
  key,
  kind,
  origin,
  original,
  point,
  originalLength: length(origin, original),
  originalAngle: heading(origin, original),
  length: length(origin, point),
  angle: heading(origin, point),
});
function arcMetrics(a: CadPoint, point: CadPoint, b: CadPoint) {
  const bulge = gripBulgeThrough(a, point, b),
    arc = bulgeArc(a, b, bulge);
  return {
    length: arc ? arc.radius * Math.abs(arc.sweepAngle) : length(a, b),
    angle: arc ? Math.abs(arc.sweepAngle) : 0,
    ...(arc ? { radius: arc.radius } : {}),
  };
}
function arcContext(
  key: string,
  a: CadPoint,
  original: CadPoint,
  b: CadPoint,
  point: CadPoint,
): GripDimensionContext {
  const before = arcMetrics(a, original, b),
    current = arcMetrics(a, point, b);
  return {
    key,
    kind: 'arc',
    origin: a,
    original,
    point,
    start: a,
    end: b,
    originalLength: before.length,
    originalAngle: before.angle,
    ...current,
  };
}
/** Definition dimensions exist only for a single shape grip; whole-object moves retain pointer input. */
export function gripDimensionContext(
  entities: readonly CadEntity[],
  hot: readonly EntityGrip[],
  anchor: EntityGrip,
  point: CadPoint,
): GripDimensionContext | undefined {
  if (hot.length !== 1 || anchor.entityIds) return;
  const entity = entities.find((candidate) => candidate.id === anchor.entityId),
    key = `${anchor.entityId}/${anchor.key}`;
  if (!entity) return;
  if (entity.type === 'line' && (anchor.key === 'a' || anchor.key === 'b'))
    return linear(key, anchor.key === 'a' ? entity.b : entity.a, anchor.point, point);
  if (entity.type === 'circle' && anchor.kind === 'quadrant')
    return linear(key, entity.center, anchor.point, point, 'circle');
  if (entity.type === 'arc' && anchor.key === 'mid') {
    const at = (angle: number): CadPoint => ({
      x: entity.center.x + entity.radius * Math.cos(angle),
      y: entity.center.y + entity.radius * Math.sin(angle),
    });
    return arcContext(
      key,
      at(entity.startAngle),
      gripArcMidpoint(entity),
      at(entity.endAngle),
      point,
    );
  }
  if (entity.type !== 'polyline' && entity.type !== 'rect') return;
  const index = Number(anchor.key.slice(1));
  if (anchor.key.startsWith('s') && entity.bulges?.[index])
    return arcContext(
      key,
      entity.points[index]!,
      gripPolylineMidpoint(entity, index),
      entity.points[(index + 1) % entity.points.length]!,
      point,
    );
  if (!anchor.key.startsWith('v')) return;
  const previous = (index - 1 + entity.points.length) % entity.points.length;
  const edge = index > 0 || entity.closed ? previous : 0;
  if (entity.bulges?.[edge]) return;
  const origin = entity.points[index > 0 || entity.closed ? previous : 1];
  return origin ? linear(key, origin, anchor.point, point) : undefined;
}
export function gripDimensionCursorContext(
  entities: readonly CadEntity[],
  hot: readonly EntityGrip[],
  anchor: EntityGrip,
  base: CadPoint,
  cursor?: CadPoint,
): GripDimensionContext | undefined {
  const offset = { x: base.x - anchor.point.x, y: base.y - anchor.point.y };
  const point = {
    ...anchor.point,
    x: (cursor?.x ?? base.x) - offset.x,
    y: (cursor?.y ?? base.y) - offset.y,
  };
  const context = gripDimensionContext(entities, hot, anchor, point);
  return context ? { ...context, pointerOffset: offset } : undefined;
}
export function visibleGripDimensions(
  context: GripDimensionContext,
  visibility: number,
  mask: number,
): GripDimensionField[] {
  const order: readonly [GripDimensionField, number][] = [
    ['lengthChange', 2],
    ['result', 1],
    ['absoluteAngle', 4],
    ['angleChange', 8],
    ['radius', 16],
  ];
  const available = order.filter(([field]) =>
    field === 'radius'
      ? context.kind === 'arc'
      : field === 'absoluteAngle' || field === 'angleChange'
        ? context.kind !== 'circle'
        : true,
  );
  return (
    visibility === 2
      ? available.filter(([, bit]) => Boolean(mask & bit))
      : available.slice(0, visibility === 0 ? 1 : 2)
  ).map(([field]) => field);
}
export function gripDimensionValues(
  context: GripDimensionContext,
): Record<GripDimensionField, number | undefined> {
  return {
    result: context.length,
    lengthChange: context.length - context.originalLength,
    absoluteAngle: context.angle,
    angleChange:
      context.kind === 'arc'
        ? context.angle - context.originalAngle
        : signedAngle(context.angle - context.originalAngle),
    radius: context.radius,
  };
}
export function updateGripDimensionContext(
  context: GripDimensionContext,
  point: CadPoint,
): GripDimensionContext {
  const current =
    context.kind === 'arc'
      ? arcMetrics(context.start!, point, context.end!)
      : { length: length(context.origin, point), angle: heading(context.origin, point) };
  const result = { ...context, point, ...current };
  if (context.kind === 'arc' && !('radius' in current)) delete result.radius;
  return result;
}
/** Resolve object-result constraints directly to a point, without rounding stored geometry. */
export function resolveGripDimensionPoint(
  context: GripDimensionContext,
  values: Partial<Record<GripDimensionField, number>>,
): CadPoint | undefined {
  if (Object.values(values).some((value) => value !== undefined && !Number.isFinite(value))) return;
  if (!Object.values(values).some((value) => value !== undefined)) return;
  const desiredLength =
    values.result ??
    (values.lengthChange === undefined
      ? context.length
      : context.originalLength + values.lengthChange);
  const desiredAngle =
    values.absoluteAngle ??
    (values.angleChange === undefined ? context.angle : context.originalAngle + values.angleChange);
  if (context.kind !== 'arc') {
    if (!Number.isFinite(desiredLength) || desiredLength <= 1e-12 || !Number.isFinite(desiredAngle))
      return;
    return {
      x: context.origin.x + desiredLength * Math.cos(desiredAngle),
      y: context.origin.y - desiredLength * Math.sin(desiredAngle),
      ...(context.original.z === undefined ? {} : { z: context.original.z }),
    };
  }
  const a = context.start!,
    b = context.end!,
    chord = length(a, b);
  if (chord <= 1e-12) return;
  let sweep = desiredAngle;
  if (values.radius !== undefined) {
    if (values.radius < chord / 2) return;
    sweep = 2 * Math.asin(Math.min(1, chord / (2 * values.radius)));
    if (context.angle > Math.PI) sweep = tau - sweep;
  } else if (values.result !== undefined || values.lengthChange !== undefined) {
    if (desiredLength < chord) return;
    let low = 0,
      high = tau - 1e-10;
    for (let i = 0; i < 64; i++) {
      const mid = (low + high) / 2;
      if ((chord * mid) / (2 * Math.sin(mid / 2)) < desiredLength) low = mid;
      else high = mid;
    }
    sweep = (low + high) / 2;
  }
  if (!Number.isFinite(sweep) || sweep < 0 || sweep >= tau) return;
  const sagitta = (chord * Math.tan(sweep / 4)) / 2;
  const cross = (b.x - a.x) * (context.point.y - a.y) - (b.y - a.y) * (context.point.x - a.x);
  const originalCross =
    (b.x - a.x) * (context.original.y - a.y) - (b.y - a.y) * (context.original.x - a.x);
  const sign = Math.sign(cross || originalCross) || 1;
  return {
    x: (a.x + b.x) / 2 - (sign * (b.y - a.y) * sagitta) / chord,
    y: (a.y + b.y) / 2 + (sign * (b.x - a.x) * sagitta) / chord,
  };
}
