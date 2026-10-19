import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  arcEntity,
  circleThrough,
  difference,
  distance,
  heading,
  middle,
  numeric,
  pointInput,
  positiveAngle,
  unit,
  TAU,
} from './draw-curve-helpers';
import {
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { lineContinuation } from './line-continuation';

export interface ConstructedArc {
  center: CadPoint;
  radius: number;
  startAngle: number;
  sweepAngle: number;
}
const angleAt = (center: CadPoint, point: CadPoint): number =>
  Math.atan2(center.y - point.y, point.x - center.x);
const entity = (context: DrawContext, arc: ConstructedArc): CadEntity =>
  arcEntity(context, arc.center, arc.radius, arc.startAngle, arc.sweepAngle);
export function arcThreePoints(
  start: CadPoint,
  through: CadPoint,
  end: CadPoint,
): ConstructedArc | undefined {
  const circle = circleThrough(start, through, end);
  if (!circle) return undefined;
  const startAngle = angleAt(circle.center, start),
    finish = positiveAngle(angleAt(circle.center, end) - startAngle),
    interim = positiveAngle(angleAt(circle.center, through) - startAngle);
  return { ...circle, startAngle, sweepAngle: interim <= finish ? finish : finish - TAU };
}
export function arcStartEndAngle(
  start: CadPoint,
  end: CadPoint,
  sweepAngle: number,
): ConstructedArc | undefined {
  const chord = distance(start, end);
  if (!chord || Math.abs(sweepAngle) < 1e-12 || Math.abs(sweepAngle) >= TAU - 1e-12)
    return undefined;
  const midpoint = middle(start, end),
    height = chord / (2 * Math.tan(sweepAngle / 2));
  const center = {
    x: midpoint.x + ((end.y - start.y) / chord) * height,
    y: midpoint.y - ((end.x - start.x) / chord) * height,
  };
  return {
    center,
    radius: distance(center, start),
    startAngle: angleAt(center, start),
    sweepAngle,
  };
}
export function arcStartEndRadius(
  start: CadPoint,
  end: CadPoint,
  signedRadius: number,
): ConstructedArc | undefined {
  const chord = distance(start, end),
    radius = Math.abs(signedRadius);
  if (!chord || radius < chord / 2) return undefined;
  const sweep = 2 * Math.asin(Math.min(1, chord / (2 * radius)));
  return arcStartEndAngle(start, end, signedRadius < 0 ? TAU - sweep : sweep);
}
export function arcTangent(
  start: CadPoint,
  end: CadPoint,
  tangent: CadPoint,
): ConstructedArc | undefined {
  const direction = unit(tangent);
  if (!direction) return undefined;
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const normal = { x: direction.y, y: -direction.x },
    twiceHeight = 2 * (normal.x * dx + normal.y * dy);
  if (Math.abs(twiceHeight) <= 1e-14 * Math.hypot(dx, dy)) return undefined;
  const signedRadius = (dx * dx + dy * dy) / twiceHeight;
  const center = { x: start.x + signedRadius * normal.x, y: start.y + signedRadius * normal.y },
    startAngle = angleAt(center, start);
  const ccw = positiveAngle(angleAt(center, end) - startAngle);
  return {
    center,
    radius: Math.abs(signedRadius),
    startAngle,
    sweepAngle: signedRadius > 0 ? ccw : ccw - TAU,
  };
}
function continuation(context: DrawContext): { point: CadPoint; tangent: CadPoint } | undefined {
  if (context.continuation?.tangent)
    return { point: context.continuation.point, tangent: context.continuation.tangent };
  const last = lineContinuation(context.entities, true);
  if (last?.tangent) return { point: last.point, tangent: last.tangent };
  return undefined;
}
function* angleInput(
  context: DrawContext,
  request: Omit<DrawRequest, 'kind'>,
  included = true,
  referenceAngle = 0,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield { ...request, kind: 'angle' };
    let angle = heading(value, context, request.base, included);
    if (angle !== undefined && drawPoint(value)) angle = positiveAngle(angle - referenceAngle);
    if (angle !== undefined && Math.abs(angle) > 1e-12 && Math.abs(angle) < TAU - 1e-12)
      return angle;
  }
}
function* centerFinish(
  context: DrawContext,
  start: CadPoint,
  center: CadPoint,
): Generator<DrawRequest, ConstructedArc, DrawValue> {
  const radius = distance(center, start),
    startAngle = angleAt(center, start);
  for (;;) {
    const input = yield {
      kind: 'point',
      ko: '호의 끝점 지정 또는 [각도(A)/현의 길이(L)]:',
      en: 'Specify end point of arc or [Angle/chord Length]:',
      base: center,
      preview: (p: CadPoint) => [
        entity(context, {
          center,
          radius,
          startAngle,
          sweepAngle: positiveAngle(angleAt(center, p) - startAngle),
        }),
      ],
    };
    const option = drawKeyword(input),
      point = drawPoint(input);
    if (option === 'A' || option === 'ANGLE') {
      const sweepAngle = yield* angleInput(
        context,
        {
          ko: '사이각 지정:',
          en: 'Specify included angle:',
          base: center,
          preview: (p) => [
            entity(context, {
              center,
              radius,
              startAngle,
              sweepAngle: positiveAngle(angleAt(center, p) - startAngle),
            }),
          ],
        },
        true,
        startAngle,
      );
      return { center, radius, startAngle, sweepAngle };
    }
    if (option === 'L' || option === 'LENGTH') {
      for (;;) {
        const length = numeric(
          yield {
            kind: 'number',
            ko: '현의 길이 지정:',
            en: 'Specify length of chord:',
            base: start,
          },
          context,
          start,
        );
        if (length !== undefined && length !== 0 && Math.abs(length) <= 2 * radius) {
          const minor = 2 * Math.asin(Math.abs(length) / (2 * radius));
          return { center, radius, startAngle, sweepAngle: length > 0 ? minor : TAU - minor };
        }
      }
    }
    if (point && distance(point, center) > 0) {
      const sweepAngle = positiveAngle(angleAt(center, point) - startAngle);
      if (sweepAngle > 0) return { center, radius, startAngle, sweepAngle };
    }
  }
}
function* endFinish(
  context: DrawContext,
  start: CadPoint,
  end: CadPoint,
): Generator<DrawRequest, ConstructedArc, DrawValue> {
  for (;;) {
    const input = yield {
      kind: 'point',
      ko: '호의 중심점 지정 또는 [각도(A)/방향(D)/반지름(R)]:',
      en: 'Specify center point of arc or [Angle/Direction/Radius]:',
      base: start,
      preview: (p: CadPoint) => {
        const radius = distance(p, start);
        return radius > 0
          ? [
              entity(context, {
                center: p,
                radius,
                startAngle: angleAt(p, start),
                sweepAngle: positiveAngle(angleAt(p, end) - angleAt(p, start)),
              }),
            ]
          : [];
      },
    };
    const option = drawKeyword(input),
      center = drawPoint(input);
    if (center && distance(center, start) > 0)
      return {
        center,
        radius: distance(center, start),
        startAngle: angleAt(center, start),
        sweepAngle: positiveAngle(angleAt(center, end) - angleAt(center, start)),
      };
    if (option === 'A' || option === 'ANGLE') {
      const sweep = yield* angleInput(context, {
        ko: '사이각 지정:',
        en: 'Specify included angle:',
        base: start,
      });
      const arc = arcStartEndAngle(start, end, sweep);
      if (arc) return arc;
    }
    if (option === 'D' || option === 'DIRECTION') {
      for (;;) {
        const value = yield {
          kind: 'angle',
          ko: '호의 시작점에 대한 접선 방향 지정:',
          en: 'Specify tangent direction for the start point of arc:',
          base: start,
          preview: (p: CadPoint) => {
            const arc = arcTangent(start, end, difference(p, start));
            return arc ? [entity(context, arc)] : [];
          },
        };
        const angle = heading(value, context, start);
        if (angle === undefined) continue;
        const arc = arcTangent(start, end, { x: Math.cos(angle), y: -Math.sin(angle) });
        if (arc) return arc;
      }
    }
    if (option === 'R' || option === 'RADIUS') {
      for (;;) {
        const radius = numeric(
          yield {
            kind: 'number',
            ko: '호의 반지름 지정:',
            en: 'Specify radius of arc:',
            base: end,
          },
          context,
          end,
        );
        const arc = radius === undefined ? undefined : arcStartEndRadius(start, end, radius);
        if (arc) return arc;
      }
    }
  }
}
export function* arcProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const input = yield {
      kind: 'point',
      ko: '호의 시작점 지정 또는 [중심(C)]:',
      en: 'Specify start point of arc or [Center]:',
    };
    if (input === '') {
      const previous = continuation(context);
      if (!previous) continue;
      for (;;) {
        const end = yield* pointInput({
          ko: '호의 끝점 지정:',
          en: 'Specify end point of arc:',
          base: previous.point,
          preview: (p) => {
            const arc = arcTangent(previous.point, p, previous.tangent);
            return arc ? [entity(context, arc)] : [];
          },
        });
        const arc = arcTangent(previous.point, end, previous.tangent);
        if (arc) return { entities: [entity(context, arc)] };
      }
    }
    const option = drawKeyword(input);
    if (option === 'C' || option === 'CENTER') {
      const center = yield* pointInput({
        ko: '호의 중심점 지정:',
        en: 'Specify center point of arc:',
      });
      const start = yield* pointInput({
        ko: '호의 시작점 지정:',
        en: 'Specify start point of arc:',
        base: center,
      });
      if (distance(center, start) > 0)
        return { entities: [entity(context, yield* centerFinish(context, start, center))] };
      continue;
    }
    const start = drawPoint(input);
    if (!start) continue;
    for (;;) {
      const next = yield {
        kind: 'point',
        ko: '호의 두 번째 점 지정 또는 [중심(C)/끝점(E)]:',
        en: 'Specify second point of arc or [Center/End]:',
        base: start,
      };
      const keyword = drawKeyword(next);
      if (keyword === 'C' || keyword === 'CENTER') {
        const center = yield* pointInput({
          ko: '호의 중심점 지정:',
          en: 'Specify center point of arc:',
          base: start,
        });
        if (distance(center, start) > 0)
          return { entities: [entity(context, yield* centerFinish(context, start, center))] };
      } else if (keyword === 'E' || keyword === 'END') {
        const end = yield* pointInput({
          ko: '호의 끝점 지정:',
          en: 'Specify end point of arc:',
          base: start,
        });
        if (distance(start, end) > 0)
          return { entities: [entity(context, yield* endFinish(context, start, end))] };
      } else {
        const through = drawPoint(next);
        if (!through || !distance(start, through)) continue;
        for (;;) {
          const end = yield* pointInput({
            ko: '호의 끝점 지정:',
            en: 'Specify end point of arc:',
            base: through,
            preview: (p) => {
              const arc = arcThreePoints(start, through, p);
              return arc ? [entity(context, arc)] : [];
            },
          });
          const arc = arcThreePoints(start, through, end);
          if (arc) return { entities: [entity(context, arc)] };
        }
      }
    }
  }
}
