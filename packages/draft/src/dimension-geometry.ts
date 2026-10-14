import type {
  CadDimension,
  CadEntity,
  CadLine,
  CadPoint,
  CadSettings,
} from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import { dimensionEntity } from './dimension-style';

const epsilon = 1e-8;
const tau = Math.PI * 2;
const modulo = (angle: number): number => ((angle % tau) + tau) % tau;
export const dimensionDistance = (a: CadPoint, b: CadPoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

export function linearDimension(
  settings: CadSettings,
  kind: 'aligned' | 'horizontal' | 'vertical',
  a: CadPoint,
  b: CadPoint,
  placement: CadPoint,
  axisAngle?: number,
  id?: string,
): CadDimension | undefined {
  if (![a, b, placement].every(validDraftPoint) || dimensionDistance(a, b) <= epsilon)
    return undefined;
  const angle =
    kind === 'aligned'
      ? Math.atan2(b.y - a.y, b.x - a.x)
      : (axisAngle ?? (kind === 'vertical' ? -Math.PI / 2 : 0));
  if (Math.abs((b.x - a.x) * Math.cos(angle) + (b.y - a.y) * Math.sin(angle)) <= epsilon)
    return undefined;
  return dimensionEntity(
    settings,
    {
      kind,
      a: { ...a },
      b: { ...b },
      offset: (placement.x - a.x) * -Math.sin(angle) + (placement.y - a.y) * Math.cos(angle),
      ...(kind !== 'aligned' && axisAngle !== undefined ? { axisAngle } : {}),
    },
    id,
  );
}

export function radialDimension(
  settings: CadSettings,
  kind: 'radius' | 'diameter',
  center: CadPoint,
  radius: number,
  placement: CadPoint,
  id?: string,
): CadDimension | undefined {
  if (
    ![center, placement].every(validDraftPoint) ||
    !Number.isFinite(radius) ||
    radius <= epsilon ||
    dimensionDistance(center, placement) <= epsilon
  )
    return undefined;
  return dimensionEntity(
    settings,
    { kind, center: { ...center }, radius, placement: { ...placement } },
    id,
  );
}

export function angularDimension(
  settings: CadSettings,
  center: CadPoint,
  a: CadPoint,
  b: CadPoint,
  placement: CadPoint,
  twoLines = false,
  id?: string,
): CadDimension | undefined {
  if (![center, a, b, placement].every(validDraftPoint)) return undefined;
  const offset = dimensionDistance(center, placement);
  if (
    [dimensionDistance(center, a), dimensionDistance(center, b), offset].some(
      (length) => length <= epsilon,
    )
  )
    return undefined;
  let first = { ...a },
    second = { ...b };
  if (twoLines) {
    const toward = (point: CadPoint): CadPoint =>
      (point.x - center.x) * (placement.x - center.x) +
        (point.y - center.y) * (placement.y - center.y) <
      0
        ? { x: center.x * 2 - point.x, y: center.y * 2 - point.y }
        : point;
    first = toward(first);
    second = toward(second);
  }
  const start = Math.atan2(first.y - center.y, first.x - center.x);
  const end = Math.atan2(second.y - center.y, second.x - center.x);
  const cursor = Math.atan2(placement.y - center.y, placement.x - center.x);
  const span = modulo(end - start);
  if (span < epsilon || tau - span < epsilon) return undefined;
  const clockwise = twoLines ? span <= Math.PI : modulo(cursor - start) <= span;
  return dimensionEntity(
    settings,
    { kind: 'angular', center: { ...center }, a: first, b: second, offset, clockwise },
    id,
  );
}

export function lineIntersection(first: CadLine, second: CadLine): CadPoint | undefined {
  const u = { x: first.b.x - first.a.x, y: first.b.y - first.a.y };
  const v = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
  const determinant = u.x * v.y - u.y * v.x;
  if (Math.abs(determinant) <= epsilon * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))
    return undefined;
  const d = { x: second.a.x - first.a.x, y: second.a.y - first.a.y };
  const t = (d.x * v.y - d.y * v.x) / determinant;
  const point = { x: first.a.x + t * u.x, y: first.a.y + t * u.y };
  return validDraftPoint(point) ? point : undefined;
}

/** Polylines in this transitional model contain only straight, already decoded segments. */
export function dimensionLineSelection(entity: CadEntity, pick?: CadPoint): CadLine | undefined {
  if (entity.type === 'line') return entity;
  if (entity.type !== 'polyline' && entity.type !== 'rect') return undefined;
  let best: CadLine | undefined;
  let bestDistance = Infinity;
  const count = entity.points.length - (entity.closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const a = entity.points[i],
      b = entity.points[(i + 1) % entity.points.length];
    if (!a || !b || dimensionDistance(a, b) <= epsilon) continue;
    const t = pick
      ? Math.max(
          0,
          Math.min(
            1,
            ((pick.x - a.x) * (b.x - a.x) + (pick.y - a.y) * (b.y - a.y)) /
              dimensionDistance(a, b) ** 2,
          ),
        )
      : 0;
    const distance = pick
      ? dimensionDistance(pick, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      : 0;
    if (distance < bestDistance) {
      best = { ...entity, type: 'line', a: { ...a }, b: { ...b } };
      bestDistance = distance;
    }
  }
  return best;
}

export function automaticLinearKind(
  a: CadPoint,
  b: CadPoint,
  placement: CadPoint,
): 'horizontal' | 'vertical' {
  if (Math.abs(a.x - b.x) <= epsilon) return 'vertical';
  if (Math.abs(a.y - b.y) <= epsilon) return 'horizontal';
  // Outside top/bottom of the origins: horizontal; outside left/right: vertical.
  if (placement.y < Math.min(a.y, b.y) || placement.y > Math.max(a.y, b.y)) return 'horizontal';
  if (placement.x < Math.min(a.x, b.x) || placement.x > Math.max(a.x, b.x)) return 'vertical';
  return Math.abs(placement.y - (a.y + b.y) / 2) >= Math.abs(placement.x - (a.x + b.x) / 2)
    ? 'horizontal'
    : 'vertical';
}
