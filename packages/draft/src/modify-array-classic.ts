import type { CadPoint } from '@hancad/legacy-bridge';
import { pointInput } from './draw-curve-helpers';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { modifySelection } from './modify-common';
import { translationMetadata, transformMetadata } from './modify-transform-metadata';
import { arrayCountValid, arrayNumber, arrayRows } from './modify-array-common';
import { rectangularEntities, type RectangularArray } from './modify-array-rect';
import {
  legacyPolarBase,
  polarEntities,
  polarArrayPoint,
  polarStep,
  rotateItems,
} from './modify-array-polar';
import { origin, transformAngle, transformNumber } from './modify-transform-geometry';

export function* classicArrayProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  let polar = false;
  for (;;) {
    const value = yield {
        kind: 'keyword',
        ko: '배열 유형 입력 [직사각형(R)/원형(P)] <직사각형>:',
        en: 'Enter the type of array [Rectangular/Polar] <Rectangular>:',
      },
      key = drawKeyword(value);
    if (value === '' || ['R', 'RECTANGULAR', 'P', 'POLAR'].includes(key)) {
      polar = ['P', 'POLAR'].includes(key);
      break;
    }
  }
  if (!polar) {
    const state: RectangularArray = {
      ...arrayRows(),
      rows: yield* arrayNumber(
        context,
        '행 수 입력 (---)',
        'Enter the number of rows (---)',
        1,
        arrayCountValid,
      ),
      columns: 1,
      columnSpacing: 1,
      angle: Number(context.get('SNAPANG') ?? 0),
    };
    state.columns = yield* arrayNumber(
      context,
      '열 수 입력 (|||)',
      'Enter the number of columns (|||)',
      1,
      (n) =>
        arrayCountValid(n) &&
        (n > 1 || state.rows > 1) &&
        n * state.rows * originals.length <= 100000,
    );
    for (;;) {
      const value = yield {
        kind: 'number',
        ko: '행 사이의 거리 입력 또는 단위 셀 지정 (---):',
        en: 'Enter the distance between rows or specify unit cell (---):',
      };
      const p = drawPoint(value);
      if (p) {
        const q = yield* pointInput({
          ko: '단위 셀의 반대쪽 구석 지정:',
          en: 'Specify opposite corner of unit cell:',
          base: p,
        });
        if (q.x === p.x || q.y === p.y) continue;
        state.columnSpacing = q.x - p.x;
        state.rowSpacing = p.y - q.y;
        break;
      }
      const n = transformNumber(value, context);
      if (n !== undefined && n !== 0) {
        state.rowSpacing = n;
        state.columnSpacing = yield* arrayNumber(
          context,
          '열 사이의 거리 지정 (|||)',
          'Specify the distance between columns (|||)',
          1,
          (v) => v !== 0,
        );
        break;
      }
    }
    return translationMetadata(context, originals, {
      entities: rectangularEntities(originals, state).slice(originals.length),
    });
  }
  let base = legacyPolarBase(originals),
    center: CadPoint | undefined;
  while (!center) {
    const value = yield {
      kind: 'point',
      ko: '배열의 중심점 지정 또는 [기준점(B)]:',
      en: 'Specify center point of array or [Base]:',
    };
    if (['B', 'BASE'].includes(drawKeyword(value)))
      base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
    else center = drawPoint(value);
  }
  let count: number | undefined;
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: '배열 항목 수 입력:',
      en: 'Enter the number of items in the array:',
    };
    if (value === '') break;
    const n = transformNumber(value, context);
    if (n !== undefined && arrayCountValid(n) && n * originals.length <= 100000) {
      count = n;
      break;
    }
  }
  let fill: number | undefined;
  while (fill === undefined) {
    const value = yield {
      kind: 'angle',
      ko: '채울 각도 지정 (+=반시계방향, -=시계방향) <360>:',
      en: 'Specify the angle to fill (+=ccw, -=cw) <360>:',
      base: center,
    };
    fill = value === '' ? 2 * Math.PI : transformAngle(value, context, center);
  }
  let angle = count && fill !== 0 ? polarStep(fill, count) : undefined;
  if (angle === undefined)
    for (;;) {
      const value = yield {
        kind: 'angle',
        ko: '항목 사이의 각도 지정 (+=반시계방향, -=시계방향):',
        en: 'Angle between items (+=ccw, -=cw):',
        base: origin,
      };
      const n = transformAngle(value, context, origin);
      if (n !== undefined && n !== 0) {
        angle = n;
        if (!count)
          count =
            Math.floor(Math.abs(fill / n)) +
            (Math.abs(Math.abs(fill) - 2 * Math.PI) < 1e-9 ? 0 : 1);
        break;
      }
    }
  if (!count || count * originals.length > 100000)
    return {
      entities: [],
      messages: [
        {
          ko: '배열이 100000개 객체 제한을 초과합니다.',
          en: 'The array exceeds the 100000 object limit.',
        },
      ],
    };
  const rotate = yield* rotateItems(true);
  const state = {
    ...arrayRows(),
    center,
    base,
    items: count,
    angle: angle!,
    rotate,
  };
  return transformMetadata(
    context,
    originals,
    { entities: polarEntities(originals, state).slice(originals.length) },
    (batch, p) => polarArrayPoint(state, batch + 1, p),
  );
}
