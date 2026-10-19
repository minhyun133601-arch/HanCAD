import type { CadPoint } from '@hancad/legacy-bridge';
import { pointInput } from './draw-curve-helpers';
import {
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { modifySelection } from './modify-common';
import { transformGripPoint } from './grip-transform';
import { transformMetadata } from './modify-transform-metadata';
import {
  pointDistance,
  transformAngle,
  transformEntities,
  transformNumber,
  transformedResult,
} from './modify-transform-geometry';

function* referenceTransform(context: DrawContext, rotate: boolean): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  const base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
  const mode = rotate ? 'ROTATE' : 'SCALE';
  let copy = false;
  const initial = Number(context.memory?.get(`${mode}.VALUE`) ?? (rotate ? 0 : 1));
  const apply = (n: number) => transformEntities(originals, mode, base, rotate ? -n : n, copy);
  for (;;) {
    const value = yield {
      kind: rotate ? 'angle' : 'number',
      ko: rotate
        ? `회전 각도 지정 또는 [복사(C)/참조(R)] <${(initial * 180) / Math.PI}>:`
        : `축척 비율 지정 또는 [복사(C)/참조(R)] <${initial}>:`,
      en: rotate
        ? `Specify rotation angle or [Copy/Reference] <${(initial * 180) / Math.PI}>:`
        : `Specify scale factor or [Copy/Reference] <${initial}>:`,
      base,
      preview: (p: CadPoint) =>
        apply(rotate ? Math.atan2(base.y - p.y, p.x - base.x) : pointDistance(base, p)),
    };
    const key = drawKeyword(value);
    if (key === 'C' || key === 'COPY') {
      copy = true;
      continue;
    }
    let amount: number | undefined;
    if (key === 'R' || key === 'REFERENCE') {
      const reference = yield* referenceValue(context, rotate, base);
      for (;;) {
        const next = yield {
          kind: rotate ? 'angle' : 'number',
          ko: rotate ? '새 각도 지정 또는 [점(P)] <0>:' : '새 길이 지정 또는 [점(P)]:',
          en: rotate ? 'Specify the new angle or [Points] <0>:' : 'Specify new length or [Points]:',
          base,
          preview: (p: CadPoint) => {
            const n = rotate ? Math.atan2(base.y - p.y, p.x - base.x) : pointDistance(base, p);
            return apply(rotate ? n - reference : n / reference);
          },
        };
        let target: number | undefined;
        if (['P', 'POINTS'].includes(drawKeyword(next))) {
          const first = yield* pointInput({ ko: '첫 번째 점 지정:', en: 'Specify first point:' });
          const second = yield* pointInput({
            ko: '두 번째 점 지정:',
            en: 'Specify second point:',
            base: first,
            preview: (p) => {
              const n = rotate ? Math.atan2(first.y - p.y, p.x - first.x) : pointDistance(first, p);
              return apply(rotate ? n - reference : n / reference);
            },
          });
          target = rotate
            ? Math.atan2(first.y - second.y, second.x - first.x)
            : pointDistance(first, second);
        } else
          target = rotate
            ? next === ''
              ? 0
              : transformAngle(next, context, base)
            : numericDistance(next, context, base);
        if (target === undefined || (!rotate && target <= 0)) continue;
        amount = rotate ? target - reference : target / reference;
        break;
      }
    } else
      amount =
        value === ''
          ? initial
          : rotate
            ? transformAngle(value, context, base)
            : numericDistance(value, context, base);
    if (amount === undefined || !Number.isFinite(amount) || (!rotate && amount <= 0)) continue;
    context.memory?.set(`${mode}.VALUE`, amount);
    return transformMetadata(
      context,
      originals,
      transformedResult(originals, apply(amount), copy),
      (_batch, p) => transformGripPoint(p, mode, base, rotate ? -amount : amount),
    );
  }
}
function numericDistance(
  value: Parameters<typeof drawPoint>[0],
  context: DrawContext,
  base: CadPoint,
): number | undefined {
  const point = drawPoint(value);
  return point ? pointDistance(point, base) : transformNumber(value, context);
}
function* referenceValue(
  context: DrawContext,
  rotate: boolean,
  base: CadPoint,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield {
      kind: rotate ? 'angle' : 'number',
      ko: rotate ? '참조 각도 지정 <0>:' : '참조 길이 지정 <1>:',
      en: rotate ? 'Specify the reference angle <0>:' : 'Specify the reference length <1>:',
      base,
    };
    const point = drawPoint(value);
    if (point) {
      const second = yield* pointInput({
        ko: '두 번째 점 지정:',
        en: 'Specify second point:',
        base: point,
      });
      if (pointDistance(point, second) <= 1e-12) continue;
      return rotate
        ? Math.atan2(point.y - second.y, second.x - point.x)
        : pointDistance(point, second);
    }
    const number =
      value === ''
        ? rotate
          ? 0
          : 1
        : rotate
          ? transformAngle(value, context, base)
          : transformNumber(value, context);
    if (number !== undefined && (rotate || number > 0)) return number;
  }
}
export const rotateProgram = (context: DrawContext): DrawProgram =>
  referenceTransform(context, true);
export const scaleProgram = (context: DrawContext): DrawProgram =>
  referenceTransform(context, false);
