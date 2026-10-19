import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { draftCircle } from './entities';
import { circleThrough, distance, middle, numeric, pointInput } from './draw-curve-helpers';
import { circleTtr, circleTtt, type TangentReference } from './draw-circle-tangent';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';

function* tangentReference(
  ko: string,
  en: string,
): Generator<DrawRequest, TangentReference, DrawValue> {
  for (;;) {
    const value = yield { kind: 'entity', ko, en };
    const entity = drawEntity(value),
      point = drawPoint(value);
    if (
      entity &&
      point &&
      (entity.type === 'line' ||
        entity.type === 'arc' ||
        entity.type === 'circle' ||
        entity.curve?.type === 'XLINE' ||
        entity.curve?.type === 'RAY')
    )
      return { entity, point };
  }
}
function result(context: DrawContext, center: CadPoint, radius: number): { entities: CadEntity[] } {
  context.set('CIRCLERAD', radius);
  return { entities: [draftCircle(context.settings, center, radius)] };
}
const positiveLengthNotice = (diameter = false) => ({
  ko: `${diameter ? '지름' : '반지름'}은 0보다 큰 값이어야 합니다.`,
  en: `The ${diameter ? 'diameter' : 'radius'} must be greater than zero.`,
});
function* tangentRadius(
  context: DrawContext,
  remembered: number,
): Generator<DrawRequest, number, DrawValue> {
  let notice: DrawRequest['notice'];
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `원의 반지름 지정${remembered > 0 ? ` <${remembered.toFixed(4)}>` : ''}:`,
      en: `Specify radius of circle${remembered > 0 ? ` <${remembered.toFixed(4)}>` : ''}:`,
      ...(notice ? { notice } : {}),
    };
    const radius = value === '' && remembered > 0 ? remembered : numeric(value, context);
    if (radius !== undefined && radius > 0) return radius;
    notice = radius !== undefined ? positiveLengthNotice() : undefined;
  }
}
export function* circleTangentProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const a = yield* tangentReference('첫 번째 접선 객체 선택:', 'Select first tangent object:');
    const b = yield* tangentReference('두 번째 접선 객체 선택:', 'Select second tangent object:');
    const c = yield* tangentReference('세 번째 접선 객체 선택:', 'Select third tangent object:');
    const circle = circleTtt([a, b, c]);
    if (circle) return result(context, circle.center, circle.radius);
    yield {
      kind: 'keyword',
      ko: '지정된 객체에 접하는 원을 작성할 수 없습니다. 계속하려면 Enter 키를 누르십시오:',
      en: 'Cannot create a circle tangent to these objects. Press Enter to continue:',
    };
  }
}
export function* circleProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const input = yield {
      kind: 'point',
      ko: '원에 대한 중심점 지정 또는 [3점(3P)/2점(2P)/Ttr - 접선 접선 반지름(T)]:',
      en: 'Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:',
    };
    const keyword = drawKeyword(input),
      center = drawPoint(input);
    if (keyword === 'TTT') return yield* circleTangentProgram(context);
    if (keyword === 'T' || keyword === 'TTR') {
      const a = yield* tangentReference(
        '첫 번째 접선에 대한 객체상의 점 지정:',
        'Specify point on object for first tangent of circle:',
      );
      const b = yield* tangentReference(
        '두 번째 접선에 대한 객체상의 점 지정:',
        'Specify point on object for second tangent of circle:',
      );
      const remembered = Number(context.get('CIRCLERAD'));
      for (;;) {
        const radius = yield* tangentRadius(context, remembered);
        const circle = circleTtr(a, b, radius);
        if (circle) return result(context, circle.center, radius);
        yield {
          kind: 'keyword',
          ko: '원이 존재하지 않습니다. 계속하려면 Enter 키를 누르십시오:',
          en: 'Circle does not exist. Press Enter to continue:',
        };
      }
    }
    if (keyword === '2P') {
      const a = yield* pointInput({
        ko: '원 지름의 첫 번째 끝점 지정:',
        en: 'Specify first end point of circle diameter:',
      });
      const b = yield* pointInput({
        ko: '원 지름의 두 번째 끝점 지정:',
        en: 'Specify second end point of circle diameter:',
        base: a,
        preview: (p) =>
          distance(p, a) > 0
            ? [draftCircle(context.settings, middle(a, p), distance(a, p) / 2)]
            : [],
      });
      if (distance(a, b) > 0) return result(context, middle(a, b), distance(a, b) / 2);
      continue;
    }
    if (keyword === '3P') {
      const a = yield* pointInput({
        ko: '원 위의 첫 번째 점 지정:',
        en: 'Specify first point on circle:',
      });
      const b = yield* pointInput({
        ko: '원 위의 두 번째 점 지정:',
        en: 'Specify second point on circle:',
        base: a,
      });
      for (;;) {
        const c = yield* pointInput({
          ko: '원 위의 세 번째 점 지정:',
          en: 'Specify third point on circle:',
          base: b,
          preview: (p) => {
            const circle = circleThrough(a, b, p);
            return circle ? [draftCircle(context.settings, circle.center, circle.radius)] : [];
          },
        });
        const circle = circleThrough(a, b, c);
        if (circle) return result(context, circle.center, circle.radius);
      }
    }
    if (!center) continue;
    let diameter = false;
    let notice: DrawRequest['notice'];
    for (;;) {
      const remembered = Number(context.get('CIRCLERAD'));
      const radiusDefault = remembered > 0 ? remembered * (diameter ? 2 : 1) : undefined;
      const value = yield {
        kind: 'number',
        base: center,
        ko: diameter
          ? `원의 지름 지정${radiusDefault ? ` <${radiusDefault.toFixed(4)}>` : ''}:`
          : `원의 반지름 지정 또는 [지름(D)]${radiusDefault ? ` <${radiusDefault.toFixed(4)}>` : ''}:`,
        en: diameter
          ? `Specify diameter of circle${radiusDefault ? ` <${radiusDefault.toFixed(4)}>` : ''}:`
          : `Specify radius of circle or [Diameter]${radiusDefault ? ` <${radiusDefault.toFixed(4)}>` : ''}:`,
        preview: (point: CadPoint) => [
          draftCircle(context.settings, center, distance(center, point) / (diameter ? 2 : 1)),
        ],
        ...(notice ? { notice } : {}),
      };
      notice = undefined;
      const option = drawKeyword(value);
      if (!diameter && (option === 'D' || option === 'DIAMETER')) {
        diameter = true;
        continue;
      }
      const length = value === '' ? radiusDefault : numeric(value, context, center);
      if (length !== undefined && length > 0)
        return result(context, center, length / (diameter ? 2 : 1));
      if (length !== undefined) notice = positiveLengthNotice(diameter);
    }
  }
}
