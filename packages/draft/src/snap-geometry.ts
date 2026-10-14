import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';

type Curve = Extract<CadEntity, { type: 'circle' | 'arc' }>;
export type SnapPrimitive =
  | { type: 'segment'; a: CadPoint; b: CadPoint; entityId: string }
  | { type: 'curve'; entity: Curve; entityId: string };

const epsilon = 1e-10;
const parameterEpsilon = Number.EPSILON * 16;

export function projectSegment(point: CadPoint, a: CadPoint, b: CadPoint): CadPoint {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy;
  const amount =
    square > 0
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
      : 0;
  return { x: a.x + amount * dx, y: a.y + amount * dy };
}

export function curvePoint(entity: Curve, angle: number): CadPoint {
  return {
    x: entity.center.x + entity.radius * Math.cos(angle),
    y: entity.center.y + entity.radius * Math.sin(angle),
  };
}

function modulo(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}
export function arcSweep(entity: Extract<CadEntity, { type: 'arc' }>): number {
  const span = entity.endAngle - entity.startAngle;
  if (Math.abs(span) >= Math.PI * 2 - epsilon) return entity.clockwise ? Math.PI * 2 : -Math.PI * 2;
  return entity.clockwise ? modulo(span) : -modulo(-span);
}
export function arcContains(entity: Curve, angle: number): boolean {
  if (entity.type === 'circle') return true;
  const sweep = arcSweep(entity);
  const offset = entity.clockwise
    ? modulo(angle - entity.startAngle)
    : modulo(entity.startAngle - angle);
  return offset <= Math.abs(sweep) + epsilon;
}

/** Only geometry within the aperture participates in pairwise intersection work. */
export function primitiveNear(
  primitive: SnapPrimitive,
  point: CadPoint,
  tolerance: number,
): boolean {
  if (primitive.type === 'segment') {
    const { a, b } = primitive;
    if (
      point.x < Math.min(a.x, b.x) - tolerance ||
      point.x > Math.max(a.x, b.x) + tolerance ||
      point.y < Math.min(a.y, b.y) - tolerance ||
      point.y > Math.max(a.y, b.y) + tolerance
    )
      return false;
    const projected = projectSegment(point, a, b);
    return Math.hypot(projected.x - point.x, projected.y - point.y) <= tolerance;
  }
  const entity = primitive.entity;
  const radialDistance = Math.abs(
    Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius,
  );
  if (radialDistance > tolerance) return false;
  if (entity.type === 'circle') return true;
  const angle = Math.atan2(point.y - entity.center.y, point.x - entity.center.x);
  if (arcContains(entity, angle)) return true;
  return [entity.startAngle, entity.endAngle].some((end) => {
    const candidate = curvePoint(entity, end);
    return Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance;
  });
}

export function primitiveIntersections(a: SnapPrimitive, b: SnapPrimitive): CadPoint[] {
  if (a.type === 'segment') {
    if (b.type === 'segment') return segmentIntersections(a, b);
    return segmentCurveIntersections(a, b.entity);
  }
  if (b.type === 'segment') return segmentCurveIntersections(b, a.entity);
  return curveIntersections(a.entity, b.entity);
}

export function* intersectingPrimitivePairs(
  primitives: readonly SnapPrimitive[],
): Generator<readonly [SnapPrimitive, SnapPrimitive]> {
  const bounds = primitives.map((primitive) => {
    if (primitive.type === 'segment')
      return {
        primitive,
        minX: Math.min(primitive.a.x, primitive.b.x),
        maxX: Math.max(primitive.a.x, primitive.b.x),
        minY: Math.min(primitive.a.y, primitive.b.y),
        maxY: Math.max(primitive.a.y, primitive.b.y),
      };
    const { center, radius } = primitive.entity;
    return {
      primitive,
      minX: center.x - radius,
      maxX: center.x + radius,
      minY: center.y - radius,
      maxY: center.y + radius,
    };
  });
  bounds.sort((a, b) => a.minX - b.minX);
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i];
    if (!a) continue;
    for (let j = i + 1; j < bounds.length; j++) {
      const b = bounds[j];
      if (!b || b.minX > a.maxX) break;
      if (a.minY <= b.maxY && b.minY <= a.maxY) yield [a.primitive, b.primitive];
    }
  }
}

function segmentIntersections(
  a: Extract<SnapPrimitive, { type: 'segment' }>,
  b: Extract<SnapPrimitive, { type: 'segment' }>,
): CadPoint[] {
  const rx = a.b.x - a.a.x,
    ry = a.b.y - a.a.y,
    sx = b.b.x - b.a.x,
    sy = b.b.y - b.a.y;
  const determinant = rx * sy - ry * sx;
  if (Math.abs(determinant) <= Number.EPSILON * Math.hypot(rx, ry) * Math.hypot(sx, sy) * 8)
    return [];
  const dx = b.a.x - a.a.x,
    dy = b.a.y - a.a.y;
  const t = (dx * sy - dy * sx) / determinant,
    u = (dx * ry - dy * rx) / determinant;
  if (
    t < -parameterEpsilon ||
    t > 1 + parameterEpsilon ||
    u < -parameterEpsilon ||
    u > 1 + parameterEpsilon
  )
    return [];
  return [
    { x: a.a.x + Math.max(0, Math.min(1, t)) * rx, y: a.a.y + Math.max(0, Math.min(1, t)) * ry },
  ];
}

function segmentCurveIntersections(
  segment: Extract<SnapPrimitive, { type: 'segment' }>,
  curve: Curve,
): CadPoint[] {
  const dx = segment.b.x - segment.a.x,
    dy = segment.b.y - segment.a.y,
    length = Math.hypot(dx, dy);
  if (length === 0) return [];
  const ux = dx / length,
    uy = dy / length,
    cx = curve.center.x - segment.a.x,
    cy = curve.center.y - segment.a.y;
  const along = cx * ux + cy * uy,
    perpendicular = cx * uy - cy * ux;
  const square = curve.radius * curve.radius - perpendicular * perpendicular;
  if (square < -Number.EPSILON * (curve.radius * curve.radius + perpendicular * perpendicular) * 16)
    return [];
  const offset = Math.sqrt(Math.max(0, square));
  const parameters = offset === 0 ? [along] : [along - offset, along + offset];
  return parameters
    .filter((t) => t / length >= -parameterEpsilon && t / length <= 1 + parameterEpsilon)
    .map((t) => {
      const clamped = Math.max(0, Math.min(length, t));
      return { x: segment.a.x + clamped * ux, y: segment.a.y + clamped * uy };
    })
    .filter((point) => onCurveSweep(curve, point));
}

function curveIntersections(a: Curve, b: Curve): CadPoint[] {
  const dx = b.center.x - a.center.x,
    dy = b.center.y - a.center.y,
    distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > a.radius + b.radius || distance < Math.abs(a.radius - b.radius))
    return [];
  const along = (distance + ((a.radius - b.radius) * (a.radius + b.radius)) / distance) / 2;
  const square = a.radius * a.radius - along * along;
  if (square < -Number.EPSILON * (a.radius * a.radius + along * along) * 16) return [];
  const offset = Math.sqrt(Math.max(0, square)),
    ux = dx / distance,
    uy = dy / distance;
  const base = { x: a.center.x + along * ux, y: a.center.y + along * uy };
  const points =
    offset === 0
      ? [base]
      : [
          { x: base.x - offset * uy, y: base.y + offset * ux },
          { x: base.x + offset * uy, y: base.y - offset * ux },
        ];
  return points.filter((point) => onCurveSweep(a, point) && onCurveSweep(b, point));
}

function onCurveSweep(curve: Curve, point: CadPoint): boolean {
  return arcContains(curve, Math.atan2(point.y - curve.center.y, point.x - curve.center.x));
}
