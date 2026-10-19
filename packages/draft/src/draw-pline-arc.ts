import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawRequest, DrawValue } from './draw-program';
import { draftLine } from './entities';
import {
  length,
  offset,
  outlineAngle,
  outlineNumber,
  outlinePoint,
  rotate,
  unit,
  vector,
  TAU,
} from './draw-outline-common';
import {
  alternateArcBulge,
  centerSegment,
  radiusSegment,
  tangentBulge,
  threePointSegment,
} from './draw-pline-geometry';
import type { PlineSegment } from './draw-pline-geometry';

type ArcProgram = Generator<DrawRequest, PlineSegment | undefined, DrawValue>;
function controlSegment(
  context: DrawContext,
  segment: PlineSegment | undefined,
): PlineSegment | undefined {
  return segment && context.isControlPressed?.()
    ? { ...segment, bulge: alternateArcBulge(segment.bulge) }
    : segment;
}
export interface PlineArcInput {
  start: CadPoint;
  tangent: CadPoint;
  partial: CadEntity[];
  preview: (end: CadPoint, bulge: number) => CadEntity[];
}
function* includedAngle(
  context: DrawContext,
  partial: CadEntity[],
  base: CadPoint,
): Generator<DrawRequest, number, DrawValue> {
  while (true) {
    const value = yield {
      kind: 'angle',
      ko: '사이각 지정:',
      en: 'Specify included angle:',
      partial,
      base,
      preview: (point) => [
        ...partial,
        draftLine(context.settings, base, point, 'pline-angle-preview'),
      ],
    };
    const angle = outlineAngle(value, context, base, true);
    if (angle !== undefined && Math.abs(angle) > 1e-12 && Math.abs(angle) < TAU - 1e-12)
      return -angle;
  }
}
function* chordSegment(
  context: DrawContext,
  input: PlineArcInput,
  radius: number,
  sweep: number,
): ArcProgram {
  const { start, tangent, partial, preview } = input;
  const defaultDirection = rotate(tangent, sweep / 2);
  const chordLength = 2 * radius * Math.abs(Math.sin(sweep / 2));
  const make = (direction: CadPoint): PlineSegment => ({
    end: offset(start, unit(direction), chordLength),
    bulge: Math.tan(sweep / 4),
  });
  while (true) {
    const value = yield {
      kind: 'angle',
      ko: '호에 대한 현의 방향 지정:',
      en: 'Specify direction of chord for arc:',
      base: start,
      partial,
      preview: (p) => {
        const segment = make(vector(start, p));
        return preview(segment.end, segment.bulge);
      },
    };
    const angle = outlineAngle(value, context, start);
    const point = drawPoint(value);
    if (drawKeyword(value) === '') return make(point ? vector(start, point) : defaultDirection);
    if (angle !== undefined) return make({ x: Math.cos(angle), y: -Math.sin(angle) });
  }
}
function* centerInput(
  context: DrawContext,
  input: PlineArcInput,
  suppliedSweep?: number,
): ArcProgram {
  const { start, partial, preview } = input;
  const center = yield* outlinePoint('호의 중심점 지정:', 'Specify center point of arc:', {
    base: start,
    partial,
  });
  if (length(start, center) <= 1e-12) return undefined;
  if (suppliedSweep !== undefined) return centerSegment(start, center, start, suppliedSweep);
  while (true) {
    const value = yield {
      kind: 'point',
      ko: '호의 끝점 지정 또는 [각도(A)/길이(L)]:',
      en: 'Specify endpoint of arc or [Angle/Length]:',
      base: start,
      partial,
      preview: (p) => {
        const segment = controlSegment(context, centerSegment(start, center, p));
        return segment ? preview(segment.end, segment.bulge) : partial;
      },
    };
    const key = drawKeyword(value),
      end = drawPoint(value);
    if (key === 'A' || key === 'ANGLE')
      return centerSegment(start, center, start, yield* includedAngle(context, partial, start));
    if (key === 'L' || key === 'LENGTH') {
      const chord = yield* outlineNumber(context, '현의 길이 지정:', 'Specify length of chord:', {
        min: 0,
        strict: true,
        partial,
      });
      const radius = length(start, center);
      if (chord > 2 * radius) continue;
      return controlSegment(
        context,
        centerSegment(start, center, start, -2 * Math.asin(chord / (2 * radius))),
      );
    }
    if (end) return controlSegment(context, centerSegment(start, center, end));
  }
}
export function* plineArcOption(
  context: DrawContext,
  keyword: string,
  input: PlineArcInput,
): ArcProgram {
  const { start, tangent, partial, preview } = input;
  if (keyword === 'CE' || keyword === 'CENTER') return yield* centerInput(context, input);
  if (keyword === 'S' || keyword === 'SECOND' || keyword === 'SECOND PT') {
    const second = yield* outlinePoint('호 위의 두 번째 점 지정:', 'Specify second point on arc:', {
      base: start,
      partial,
    });
    const end = yield* outlinePoint('호의 끝점 지정:', 'Specify end point of arc:', {
      base: second,
      partial,
      preview: (p) => {
        const segment = threePointSegment(start, second, p);
        return segment ? preview(segment.end, segment.bulge) : partial;
      },
    });
    return threePointSegment(start, second, end);
  }
  if (keyword === 'D' || keyword === 'DIRECTION') {
    let direction: CadPoint | undefined;
    while (!direction) {
      const value = yield {
        kind: 'angle',
        ko: '호의 시작점에서 접선 방향 지정:',
        en: 'Specify the tangent direction from the start point of arc:',
        base: start,
        partial,
      };
      const angle = outlineAngle(value, context, start);
      if (angle !== undefined) direction = { x: Math.cos(angle), y: -Math.sin(angle) };
    }
    const t = direction;
    const end = yield* outlinePoint('호의 끝점 지정:', 'Specify endpoint of arc:', {
      base: start,
      partial,
      preview: (p) => {
        const segment = controlSegment(context, { end: p, bulge: tangentBulge(start, p, t) ?? 0 });
        return preview(p, segment?.bulge ?? 0);
      },
    });
    const bulge = tangentBulge(start, end, t);
    return controlSegment(context, bulge === undefined ? undefined : { end, bulge });
  }
  const byAngle = keyword === 'A' || keyword === 'ANGLE';
  if (byAngle) {
    const sweep = yield* includedAngle(context, partial, start);
    while (true) {
      const value = yield {
        kind: 'point',
        ko: '호의 끝점 지정 또는 [중심(CE)/반지름(R)]:',
        en: 'Specify endpoint of arc or [Center/Radius]:',
        base: start,
        partial,
        preview: (p) => preview(p, Math.tan(sweep / 4)),
      };
      const key = drawKeyword(value),
        end = drawPoint(value);
      if (key === 'CE' || key === 'C' || key === 'CENTER')
        return yield* centerInput(context, input, sweep);
      if (key === 'R' || key === 'RADIUS') {
        const radius = yield* outlineNumber(
          context,
          '호의 반지름 지정:',
          'Specify radius of arc:',
          { min: 0, strict: true, partial },
        );
        return yield* chordSegment(context, input, radius, sweep);
      }
      if (end && length(start, end) > 1e-12) return { end, bulge: Math.tan(sweep / 4) };
    }
  }
  if (keyword === 'R' || keyword === 'RADIUS') {
    const radius = yield* outlineNumber(context, '호의 반지름 지정:', 'Specify radius of arc:', {
      min: 0,
      strict: true,
      partial,
    });
    while (true) {
      const value = yield {
        kind: 'point',
        ko: '호의 끝점 지정 또는 [각도(A)]:',
        en: 'Specify endpoint of arc or [Angle]:',
        base: start,
        partial,
        preview: (p) => {
          const s = controlSegment(context, radiusSegment(start, p, radius, tangent));
          return s ? preview(s.end, s.bulge) : partial;
        },
      };
      const key = drawKeyword(value),
        end = drawPoint(value);
      if (key === 'A' || key === 'ANGLE')
        return yield* chordSegment(
          context,
          input,
          radius,
          yield* includedAngle(context, partial, start),
        );
      if (end) {
        const segment = controlSegment(context, radiusSegment(start, end, radius, tangent));
        if (segment) return segment;
      }
    }
  }
  return undefined;
}
