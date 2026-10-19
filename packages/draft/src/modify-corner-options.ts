import {
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { heading, scalarInput, distance, numeric } from './draw-curve-helpers';
import type { CornerSettings } from './modify-corner-polyline';
import { cornerExpression } from './modify-corner-expression';

function* expressionInput(
  context: DrawContext,
  ko: string,
  en: string,
  fallback: number,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield { kind: 'number', ko: `${ko} <${fallback}>:`, en: `${en} <${fallback}>:` };
    if (value === '') return fallback;
    const base = drawPoint(value);
    if (base) {
      for (;;) {
        const point = drawPoint(
          yield { kind: 'point', ko: '두 번째 점 지정:', en: 'Specify second point:', base },
        );
        if (point) return distance(base, point);
      }
    }
    const key = drawKeyword(value);
    const expression =
      key === 'E' || key === 'EXPRESSION'
        ? yield { kind: 'text', ko: '표현식 입력:', en: 'Enter expression:' }
        : value;
    const number =
      typeof expression === 'string'
        ? (numeric(expression, context) ?? cornerExpression(expression))
        : undefined;
    if (number !== undefined && number >= 0) return number;
  }
}
interface OptionResult {
  handled: boolean;
  settings: CornerSettings;
  trim: boolean;
}
export function* cornerOption(
  context: DrawContext,
  key: string,
  settings: CornerSettings,
  trim: boolean,
): Generator<DrawRequest, OptionResult, DrawValue> {
  const fillet = settings.fillet;
  if (['R', 'RADIUS'].includes(key) && fillet) {
    const radius = yield* scalarInput(
      context,
      {
        ko: `모깎기 반지름 지정 <${settings.radius}>:`,
        en: `Specify fillet radius <${settings.radius}>:`,
      },
      (n) => n >= 0,
      settings.radius,
    );
    settings = { ...settings, radius };
    context.set('FILLETRAD', radius);
  } else if (['T', 'TRIM'].includes(key)) {
    for (;;) {
      const mode = drawKeyword(
        yield {
          kind: 'keyword',
          ko: `자르기 모드 입력 [자르기(T)/자르지 않기(N)] <${trim ? '자르기' : '자르지 않기'}>:`,
          en: `Enter Trim mode option [Trim/No trim] <${trim ? 'Trim' : 'No trim'}>:`,
        },
      );
      if (!mode) break;
      if (['T', 'TRIM', 'N', 'NO', 'NO TRIM', 'NOTRIM'].includes(mode)) {
        trim = mode.startsWith('T');
        context.set('TRIMMODE', trim ? 1 : 0);
        break;
      }
    }
  } else if (!fillet && ['D', 'DISTANCE'].includes(key)) {
    const distance1 = yield* expressionInput(
        context,
        '첫 번째 모따기 거리 지정',
        'Specify first chamfer distance',
        settings.distance1,
      ),
      distance2 = yield* expressionInput(
        context,
        '두 번째 모따기 거리 지정',
        'Specify second chamfer distance',
        settings.distance2,
      );
    settings = { fillet: false, radius: 0, distance1, distance2 };
    context.set('CHAMFERA', distance1);
    context.set('CHAMFERB', distance2);
    context.set('CHAMMODE', 0);
  } else if (!fillet && ['A', 'ANGLE'].includes(key)) {
    const distance1 = yield* expressionInput(
      context,
      '첫 번째 선의 모따기 길이 지정',
      'Specify chamfer length on the first line',
      Number(context.get('CHAMFERC')) || 0,
    );
    let angle: number | undefined;
    while (angle === undefined) {
      const fallback = Number(context.get('CHAMFERD')) || 0,
        answer = yield {
          kind: 'angle',
          ko: `첫 번째 선으로부터 모따기 각도 지정 <${(fallback * 180) / Math.PI}>:`,
          en: `Specify chamfer angle from the first line <${(fallback * 180) / Math.PI}>:`,
        };
      angle = answer === '' ? fallback : heading(answer, context, undefined, true);
      if (angle !== undefined && (angle < 0 || angle >= Math.PI)) angle = undefined;
    }
    settings = { ...settings, distance1, angle };
    context.set('CHAMFERC', distance1);
    context.set('CHAMFERD', angle);
    context.set('CHAMMODE', 1);
  } else if (!fillet && ['E', 'METHOD'].includes(key)) {
    for (;;) {
      const method = drawKeyword(
        yield {
          kind: 'keyword',
          ko: `모따기 방법 입력 [거리(D)/각도(A)] <${settings.angle === undefined ? '거리' : '각도'}>:`,
          en: `Enter chamfer method [Distance/Angle] <${settings.angle === undefined ? 'Distance' : 'Angle'}>:`,
        },
      );
      if (!method) break;
      if (['A', 'ANGLE'].includes(method)) {
        settings = {
          ...settings,
          distance1: Number(context.get('CHAMFERC')) || 0,
          angle: Number(context.get('CHAMFERD')) || 0,
        };
        context.set('CHAMMODE', 1);
        break;
      }
      if (['D', 'DISTANCE'].includes(method)) {
        settings = {
          fillet: false,
          radius: 0,
          distance1: Number(context.get('CHAMFERA')) || 0,
          distance2: Number(context.get('CHAMFERB')) || 0,
        };
        context.set('CHAMMODE', 0);
        break;
      }
    }
  } else return { handled: false, settings, trim };
  return { handled: true, settings, trim };
}
