import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { pointInput } from './draw-curve-helpers';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { modifyResult, modifySelection } from './modify-common';
import { translationMetadata } from './modify-transform-metadata';
import { origin, transformEntities, transformNumber } from './modify-transform-geometry';
import {
  arrayAssociative,
  arrayBounds,
  arrayCountValid,
  arrayExit,
  arrayNumber,
  arrayRows,
  arraySpacing,
  editArrayRows,
  type ArrayRows,
} from './modify-array-common';

export interface RectangularArray extends ArrayRows {
  columns: number;
  columnSpacing: number;
  angle: number;
}
export function rectangularEntities(
  originals: readonly CadEntity[],
  state: RectangularArray,
): CadEntity[] {
  const entities: CadEntity[] = [],
    c = Math.cos(state.angle),
    s = Math.sin(state.angle);
  if (state.columns * state.rows * state.levels * originals.length > 100000) return [];
  for (let level = 0; level < state.levels; level++)
    for (let row = 0; row < state.rows; row++)
      for (let column = 0; column < state.columns; column++) {
        const x = column * state.columnSpacing,
          y = -row * state.rowSpacing;
        entities.push(
          ...transformEntities(
            originals,
            'MOVE',
            origin,
            {
              x: x * c + y * s,
              y: -x * s + y * c,
              z: level * state.levelSpacing + row * state.rowElevation,
            },
            !!(level || row || column),
          ),
        );
      }
  return entities;
}
export function* arrayRectProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  const bounds = arrayBounds(originals),
    state: RectangularArray = {
      ...arrayRows(),
      rows: 3,
      columns: 4,
      columnSpacing: bounds.width * 1.5 || 1,
      rowSpacing: bounds.height * 1.5 || 1,
      angle: 0,
    };
  let base = bounds.base;
  for (;;) {
    const entities = rectangularEntities(originals, state);
    const value = yield {
      kind: 'keyword',
      ko: '배열을 편집할 그립 선택 또는 [연관(AS)/기준점(B)/개수(COU)/간격(S)/열(COL)/행(R)/수준(L)/종료(X)] <종료>:',
      en: 'Select grip to edit array or [ASsociative/Base point/COUnt/Spacing/COLumns/Rows/Levels/eXit] <eXit>:',
      previewEntities: entities,
      preview: () => entities,
      previewHiddenIds: originals.map((e) => e.id),
    };
    if (arrayExit(value))
      return translationMetadata(context, originals, modifyResult(originals, entities));
    const key = drawKeyword(value);
    if (['AS', 'ASSOCIATIVE'].includes(key)) yield* arrayAssociative();
    else if (['B', 'BASEPOINT', 'BASE'].includes(key))
      base = yield* pointInput({ ko: '기준점 지정:', en: 'Specify base point:' });
    else if (['COL', 'COLUMNS'].includes(key)) {
      state.columns = yield* arrayNumber(
        context,
        '열 수 입력',
        'Enter the number of columns',
        state.columns,
        (n) => arrayCountValid(n) && n * state.rows * state.levels * originals.length <= 100000,
      );
      state.columnSpacing = yield* arraySpacing(
        context,
        '열 간 거리 지정',
        'Specify the distance between columns',
        state.columnSpacing,
        state.columns,
      );
    } else if (['R', 'ROWS'].includes(key))
      yield* editArrayRows(context, state, false, state.columns * originals.length);
    else if (['L', 'LEVELS'].includes(key))
      yield* editArrayRows(context, state, true, state.columns * originals.length);
    else if (['COU', 'COUNT'].includes(key)) {
      state.columns = yield* arrayNumber(
        context,
        '열 수 입력',
        'Enter the number of columns',
        state.columns,
        (n) => arrayCountValid(n) && n * state.rows * state.levels * originals.length <= 100000,
      );
      state.rows = yield* arrayNumber(
        context,
        '행 수 입력',
        'Enter the number of rows',
        state.rows,
        (n) => arrayCountValid(n) && n * state.columns * state.levels * originals.length <= 100000,
      );
    } else if (['S', 'SPACING'].includes(key)) {
      const first = yield {
        kind: 'number',
        ko: `행 간 거리 지정 또는 [단위 셀(U)] <${state.rowSpacing}>:`,
        en: `Specify the distance between rows or [Unit cell] <${state.rowSpacing}>:`,
        base,
        preview: (p: CadPoint) =>
          rectangularEntities(originals, {
            ...state,
            rowSpacing: base.y - p.y,
            columnSpacing: p.x - base.x,
          }),
      };
      if (['U', 'UNITCELL'].includes(drawKeyword(first))) {
        const a = yield* pointInput({
          ko: '단위 셀의 첫 번째 구석 지정:',
          en: 'Specify first corner of unit cell:',
        });
        const b = yield* pointInput({
          ko: '단위 셀의 반대쪽 구석 지정:',
          en: 'Specify opposite corner of unit cell:',
          base: a,
          preview: (p) =>
            rectangularEntities(originals, {
              ...state,
              rowSpacing: a.y - p.y,
              columnSpacing: p.x - a.x,
            }),
        });
        if (b.x !== a.x && b.y !== a.y) {
          state.columnSpacing = b.x - a.x;
          state.rowSpacing = a.y - b.y;
        }
      } else {
        const p = drawPoint(first),
          n = first === '' ? state.rowSpacing : p ? base.y - p.y : transformNumber(first, context);
        if (n !== undefined && n !== 0) state.rowSpacing = n;
        state.columnSpacing = yield* arraySpacing(
          context,
          '열 간 거리 지정',
          'Specify the distance between columns',
          state.columnSpacing,
          state.columns,
        );
      }
    }
  }
}
