import type { CadArc, CadEntity, CadLine, CadPoint } from '@hancad/legacy-bridge';
import { distance, unit, difference, wcs, model, TAU } from './draw-curve-helpers';

export const add = (a: CadPoint, b: CadPoint, k = 1): CadPoint => ({
  x: a.x + b.x * k,
  y: a.y + b.y * k,
  ...(a.z === undefined ? {} : { z: a.z }),
});
export const dot = (a: CadPoint, b: CadPoint): number => a.x * b.x + a.y * b.y;
export const cross = (a: CadPoint, b: CadPoint): number => a.x * b.y - a.y * b.x;
export const normal = (a: CadPoint): CadPoint => ({ x: -a.y, y: a.x });
export interface SupportLine {
  kind: 'line';
  a: CadPoint;
  direction: CadPoint;
}
export interface SupportCircle {
  kind: 'circle';
  center: CadPoint;
  radius: number;
}
export type Support = SupportLine | SupportCircle;
export function support(entity: CadEntity): Support | undefined {
  if (entity.type === 'line') {
    const direction = unit(difference(entity.b, entity.a));
    return direction ? { kind: 'line', a: entity.a, direction } : undefined;
  }
  if (entity.type === 'arc' || entity.type === 'circle')
    return { kind: 'circle', center: entity.center, radius: entity.radius };
  if (entity.curve?.type === 'XLINE' || entity.curve?.type === 'RAY')
    return {
      kind: 'line',
      a: model(entity.curve.basePoint),
      direction: unit({ x: entity.curve.direction.x, y: -entity.curve.direction.y })!,
    };
  return undefined;
}
export function supportIntersections(a: Support, b: Support): CadPoint[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const det = cross(a.direction, b.direction);
    return Math.abs(det) < 1e-12
      ? []
      : [add(a.a, a.direction, cross(difference(b.a, a.a), b.direction) / det)];
  }
  if (a.kind === 'circle' && b.kind === 'line') return supportIntersections(b, a);
  if (a.kind === 'line' && b.kind === 'circle') {
    const delta = difference(b.center, a.a),
      along = dot(delta, a.direction),
      perp = cross(delta, a.direction);
    const q = b.radius * b.radius - perp * perp;
    if (q < -1e-9) return [];
    const root = Math.sqrt(Math.max(0, q));
    return root < 1e-10
      ? [add(a.a, a.direction, along)]
      : [add(a.a, a.direction, along - root), add(a.a, a.direction, along + root)];
  }
  if (a.kind !== 'circle' || b.kind !== 'circle') return [];
  const d = distance(a.center, b.center),
    u = unit(difference(b.center, a.center));
  if (!u || d > a.radius + b.radius + 1e-9 || d < Math.abs(a.radius - b.radius) - 1e-9) return [];
  const x = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, a.radius * a.radius - x * x));
  const foot = add(a.center, u, x);
  return h < 1e-10 ? [foot] : [add(foot, normal(u), h), add(foot, normal(u), -h)];
}
export function arcAt(
  base: CadEntity,
  center: CadPoint,
  radius: number,
  a: CadPoint,
  b: CadPoint,
  sign?: number,
): CadArc {
  const start = Math.atan2(a.y - center.y, a.x - center.x),
    end = Math.atan2(b.y - center.y, b.x - center.x);
  let sweep = (((end - start) % TAU) + TAU) % TAU;
  if (sign === undefined ? sweep > Math.PI : sign < 0) sweep -= TAU;
  return {
    ...base,
    type: 'arc',
    center,
    radius,
    startAngle: start,
    endAngle: start + sweep,
    clockwise: sweep > 0,
    sourceType: 'ARC',
    curve: {
      type: 'ARC',
      center: wcs(center),
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      radius,
      startAngle: -start,
      sweepAngle: -sweep,
    },
  };
}
export function trimAt(entity: CadEntity, point: CadPoint, pick: CadPoint): CadEntity {
  if (entity.curve?.type === 'XLINE' || entity.curve?.type === 'RAY') {
    const source = entity.curve,
      origin = model(source.basePoint),
      direction = unit({ x: source.direction.x, y: -source.direction.y })!;
    const keepForward = dot(difference(pick, point), direction) >= 0;
    if (source.type === 'RAY' && !keepForward)
      return {
        ...entity,
        type: 'line',
        a: origin,
        b: point,
        sourceType: 'LINE',
        curve: { type: 'LINE', start: wcs(origin), end: wcs(point) },
      };
    const sign = keepForward ? 1 : -1,
      end = add(point, direction, sign);
    return {
      ...entity,
      type: 'polyline',
      points: [point, end],
      closed: false,
      sourceType: 'RAY',
      curve: {
        type: 'RAY',
        basePoint: wcs(point),
        direction: { x: direction.x * sign, y: -direction.y * sign, z: 0 },
      },
    };
  }
  if (entity.type === 'line') {
    const d = unit(difference(entity.b, entity.a))!;
    const pickSide = dot(difference(pick, point), d);
    const sideA = dot(difference(entity.a, point), d),
      sideB = dot(difference(entity.b, point), d);
    const keepA =
      pickSide < -1e-10
        ? sideA <= sideB
        : pickSide > 1e-10
          ? sideA >= sideB
          : distance(entity.a, point) > distance(entity.b, point);
    const a = keepA ? entity.a : point,
      b = keepA ? point : entity.b;
    return {
      ...entity,
      a,
      b,
      ...(entity.curve ? { curve: { type: 'LINE' as const, start: wcs(a), end: wcs(b) } } : {}),
    };
  }
  if (entity.type === 'arc') {
    const a = {
      x: entity.center.x + entity.radius * Math.cos(entity.startAngle),
      y: entity.center.y + entity.radius * Math.sin(entity.startAngle),
    };
    const b = {
      x: entity.center.x + entity.radius * Math.cos(entity.endAngle),
      y: entity.center.y + entity.radius * Math.sin(entity.endAngle),
    };
    const keepA = distance(pick, a) < distance(pick, b);
    return arcAt(
      entity,
      entity.center,
      entity.radius,
      keepA ? a : point,
      keepA ? point : b,
      entity.clockwise ? 1 : -1,
    );
  }
  return entity;
}
function offsetSupports(source: Support, radius: number): Support[] {
  return source.kind === 'line'
    ? [
        { ...source, a: add(source.a, normal(source.direction), radius) },
        { ...source, a: add(source.a, normal(source.direction), -radius) },
      ]
    : [source.radius + radius, Math.abs(source.radius - radius)]
        .filter((r) => r > 1e-10)
        .map((r) => ({ ...source, radius: r }));
}
function tangencies(source: Support, center: CadPoint, radius: number): CadPoint[] {
  if (source.kind === 'line')
    return [add(source.a, source.direction, dot(difference(center, source.a), source.direction))];
  const direction = unit(difference(center, source.center));
  if (!direction) return [];
  return [
    add(source.center, direction, source.radius),
    add(source.center, direction, -source.radius),
  ].filter((p) => Math.abs(distance(p, center) - radius) < 1e-6 * Math.max(1, radius));
}
export interface CornerSolution {
  first: CadPoint;
  second: CadPoint;
  center?: CadPoint;
  radius: number;
  connector?: CadEntity;
}
export function filletSolution(
  first: CadEntity,
  second: CadEntity,
  pickA: CadPoint,
  pickB: CadPoint,
  radius: number,
): CornerSolution | undefined {
  const a = support(first),
    b = support(second);
  if (!a || !b) return;
  if (a.kind === 'line' && b.kind === 'line' && Math.abs(cross(a.direction, b.direction)) < 1e-10) {
    if (first.curve?.type === 'XLINE') return;
    const separation = cross(a.direction, difference(b.a, a.a));
    if (Math.abs(separation) < 1e-10) return;
    const endpoint =
      first.type === 'line'
        ? distance(first.a, pickA) < distance(first.b, pickA)
          ? first.a
          : first.b
        : first.curve?.type === 'RAY'
          ? model(first.curve.basePoint)
          : pickA;
    const pa = add(a.a, a.direction, dot(difference(endpoint, a.a), a.direction)),
      pb = add(pa, normal(a.direction), separation),
      center = add(pa, normal(a.direction), separation / 2);
    return {
      first: pa,
      second: pb,
      center,
      radius: Math.abs(separation / 2),
      connector: arcAt(
        first,
        center,
        Math.abs(separation / 2),
        pa,
        pb,
        cross(difference(pa, center), difference(pa, pickA)) >= 0 ? 1 : -1,
      ),
    };
  }
  if (radius === 0) {
    const points = supportIntersections(a, b).sort(
      (p, q) => distance(p, pickA) + distance(p, pickB) - distance(q, pickA) - distance(q, pickB),
    );
    return points[0] ? { first: points[0], second: points[0], radius: 0 } : undefined;
  }
  let best: CornerSolution | undefined,
    score = Infinity;
  for (const sa of offsetSupports(a, radius))
    for (const sb of offsetSupports(b, radius))
      for (const center of supportIntersections(sa, sb))
        for (const pa of tangencies(a, center, radius))
          for (const pb of tangencies(b, center, radius)) {
            if (distance(pa, pb) < 1e-10) continue;
            const cost = distance(pa, pickA) + distance(pb, pickB);
            if (cost < score) {
              score = cost;
              best = {
                first: pa,
                second: pb,
                center,
                radius,
                connector: arcAt(first, center, radius, pa, pb),
              };
            }
          }
  return best;
}
export function chamferSolution(
  first: CadEntity,
  second: CadEntity,
  pickA: CadPoint,
  pickB: CadPoint,
  d1: number,
  d2: number,
  angle?: number,
): CornerSolution | undefined {
  const a = support(first),
    b = support(second);
  if (a?.kind !== 'line' || b?.kind !== 'line') return;
  const vertex = supportIntersections(a, b)[0];
  if (!vertex) return;
  const u = unit(difference(pickA, vertex)) ?? a.direction,
    v = unit(difference(pickB, vertex)) ?? b.direction;
  const alongA = add(vertex, a.direction, dot(u, a.direction) >= 0 ? d1 : -d1);
  if (angle !== undefined) {
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (theta + angle >= Math.PI || angle < 0) return;
    d2 = (d1 * Math.sin(angle)) / Math.sin(theta + angle);
  }
  const alongB = add(vertex, b.direction, dot(v, b.direction) >= 0 ? d2 : -d2);
  return {
    first: alongA,
    second: alongB,
    radius: 0,
    ...(distance(alongA, alongB) > 1e-10
      ? {
          connector: {
            ...first,
            type: 'line',
            a: alongA,
            b: alongB,
            curve: { type: 'LINE', start: wcs(alongA), end: wcs(alongB) },
            sourceType: 'LINE',
          } as CadLine,
        }
      : {}),
  };
}
