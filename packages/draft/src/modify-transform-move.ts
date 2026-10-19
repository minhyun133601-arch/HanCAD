import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { modifySelection } from './modify-common';
import {
  deltaPoint,
  origin,
  transformEntities,
  transformNumber,
  transformedResult,
} from './modify-transform-geometry';
import { translationMetadata } from './modify-transform-metadata';

function* moveCopy(context: DrawContext, copy: boolean): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  let base: CadPoint | undefined,
    displacement = false,
    multiple = Number(context.get('COPYMODE') ?? 0) === 0;
  while (!base) {
    const value = yield {
      kind: 'point',
      ko: copy
        ? '기준점 지정 또는 [변위(D)/모드(O)/다중(M)] <변위>:'
        : '기준점 지정 또는 [변위(D)] <변위>:',
      en: copy
        ? 'Specify base point or [Displacement/mOde/Multiple] <Displacement>:'
        : 'Specify base point or [Displacement] <Displacement>:',
    };
    const key = drawKeyword(value);
    if (copy && (key === 'O' || key === 'MODE')) {
      for (;;) {
        const choice = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `복사 모드 입력 [단일(S)/다중(M)] <${multiple ? '다중' : '단일'}>:`,
            en: `Enter a copy mode option [Single/Multiple] <${multiple ? 'Multiple' : 'Single'}>:`,
          },
        );
        if (!choice || ['S', 'SINGLE', 'M', 'MULTIPLE'].includes(choice)) {
          if (choice) multiple = choice === 'M' || choice === 'MULTIPLE';
          context.set('COPYMODE', multiple ? 0 : 1);
          break;
        }
      }
    } else if (copy && (key === 'M' || key === 'MULTIPLE')) multiple = true;
    else if (key === 'D' || key === 'DISPLACEMENT' || value === '') {
      base = origin;
      displacement = true;
    } else base = drawPoint(value);
  }
  if (displacement) {
    const name = copy ? 'COPY' : 'MOVE',
      fallback = {
        x: Number(context.memory?.get(`${name}.DX`) ?? 0),
        y: Number(context.memory?.get(`${name}.DY`) ?? 0),
        z: Number(context.memory?.get(`${name}.DZ`) ?? 0),
      };
    let value: CadPoint | undefined;
    while (!value) {
      const input = yield {
        kind: 'point',
        ko: `변위 지정 <${fallback.x},${-fallback.y},${fallback.z}>:`,
        en: `Specify displacement <${fallback.x},${-fallback.y},${fallback.z}>:`,
        base: origin,
        preview: (p: CadPoint) => transformEntities(originals, 'MOVE', origin, p, copy),
      };
      value = input === '' ? fallback : drawPoint(input);
    }
    rememberDisplacement(context, name, value);
    const entities = transformEntities(originals, 'MOVE', origin, value, copy);
    if (!copy || !multiple)
      return translationMetadata(context, originals, transformedResult(originals, entities, copy));
    return yield* placements(context, originals, origin, entities);
  }
  if (copy) return yield* placements(context, originals, base, [], multiple);
  for (;;) {
    const value = yield {
      kind: 'point',
      ko: '두 번째 점 지정 또는 <첫 번째 점을 변위로 사용>:',
      en: 'Specify second point or <use first point as displacement>:',
      base,
      preview: (p: CadPoint) => transformEntities(originals, 'MOVE', base, deltaPoint(p, base)),
    };
    const point = drawPoint(value),
      delta = value === '' ? base : point ? deltaPoint(point, base) : undefined;
    if (delta) {
      rememberDisplacement(context, 'MOVE', delta);
      return translationMetadata(
        context,
        originals,
        transformedResult(originals, transformEntities(originals, 'MOVE', base, delta), false),
      );
    }
  }
}
function* placements(
  context: DrawContext,
  originals: CadEntity[],
  base: CadPoint,
  initial: CadEntity[],
  multiple = true,
): DrawProgram {
  const batches: CadEntity[][] = initial.length ? [initial] : [];
  for (;;) {
    const partial = batches.flat();
    const partialResult = translationMetadata(context, originals, { entities: partial });
    const value = yield {
      kind: 'point',
      ko: batches.length
        ? '두 번째 점 지정 또는 [배열(A)/종료(E)/명령 취소(U)] <종료>:'
        : '두 번째 점 지정 또는 [배열(A)] <첫 번째 점을 변위로 사용>:',
      en: batches.length
        ? 'Specify second point or [Array/Exit/Undo] <Exit>:'
        : 'Specify second point or [Array] <use first point as displacement>:',
      base,
      partial,
      partialResult,
      preview: (p: CadPoint) => [
        ...partial,
        ...transformEntities(originals, 'MOVE', base, deltaPoint(p, base), true),
      ],
    };
    const key = drawKeyword(value);
    if (key === 'E' || key === 'EXIT' || (value === '' && batches.length)) return partialResult;
    if (key === 'U' || key === 'UNDO') {
      batches.pop();
      continue;
    }
    let count = 2,
      fit = false,
      point = drawPoint(value);
    if (key === 'A' || key === 'ARRAY') {
      for (;;) {
        const n = transformNumber(
          yield {
            kind: 'number',
            ko: '배열할 항목 수 입력:',
            en: 'Enter number of items to array:',
            partial,
          },
          context,
        );
        if (n !== undefined && Number.isInteger(n) && n >= 2 && n * originals.length <= 100000) {
          count = n;
          break;
        }
      }
      while (!point) {
        const target = yield {
          kind: 'point',
          ko: fit
            ? '두 번째 점 지정 <첫 번째 점을 변위로 사용>:'
            : '두 번째 점 지정 또는 [맞춤(F)] <첫 번째 점을 변위로 사용>:',
          en: fit
            ? 'Specify second point <use first point as displacement>:'
            : 'Specify second point or [Fit] <use first point as displacement>:',
          base,
          partial,
          preview: (p: CadPoint) => [
            ...partial,
            ...arrayCopies(originals, base, deltaPoint(p, base), count, fit),
          ],
        };
        if (['F', 'FIT'].includes(drawKeyword(target))) fit = true;
        else
          point =
            target === ''
              ? { x: 2 * base.x, y: 2 * base.y, z: 2 * (base.z ?? 0) }
              : drawPoint(target);
      }
    }
    const delta = value === '' ? base : point ? deltaPoint(point, base) : undefined;
    if (!delta) continue;
    rememberDisplacement(context, 'COPY', delta);
    batches.push(arrayCopies(originals, base, delta, count, fit));
    if (!multiple) return translationMetadata(context, originals, { entities: batches.flat() });
  }
}
function arrayCopies(
  originals: CadEntity[],
  base: CadPoint,
  delta: CadPoint,
  count: number,
  fit: boolean,
): CadEntity[] {
  return Array.from({ length: count - 1 }, (_, i) => {
    const factor = (i + 1) / (fit ? count - 1 : 1);
    return transformEntities(
      originals,
      'MOVE',
      base,
      {
        x: delta.x * factor,
        y: delta.y * factor,
        ...(delta.z === undefined ? {} : { z: delta.z * factor }),
      },
      true,
    );
  }).flat();
}
export const moveProgram = (context: DrawContext): DrawProgram => moveCopy(context, false);
export const copyProgram = (context: DrawContext): DrawProgram => moveCopy(context, true);
function rememberDisplacement(context: DrawContext, name: string, delta: CadPoint): void {
  context.memory?.set(`${name}.DX`, delta.x);
  context.memory?.set(`${name}.DY`, delta.y);
  context.memory?.set(`${name}.DZ`, delta.z ?? 0);
}
