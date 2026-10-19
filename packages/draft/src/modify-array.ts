import { drawKeyword, type DrawContext, type DrawFactory, type DrawProgram } from './draw-program';
import { arrayRectProgram } from './modify-array-rect';
import { arrayPolarProgram } from './modify-array-polar';
import { arrayPathProgram } from './modify-array-path';
import { classicArrayProgram } from './modify-array-classic';

export function* arrayProgram(context: DrawContext): DrawProgram {
  for (;;) {
    const value = yield {
        kind: 'keyword',
        ko: '배열 유형 입력 [직사각형(R)/경로(PA)/원형(PO)] <직사각형>:',
        en: 'Enter array type [Rectangular/PAth/POlar] <Rectangular>:',
      },
      key = drawKeyword(value);
    if (value === '' || ['R', 'RECTANGULAR'].includes(key)) return yield* arrayRectProgram(context);
    if (['PA', 'PATH'].includes(key)) return yield* arrayPathProgram(context);
    if (['PO', 'POLAR'].includes(key)) return yield* arrayPolarProgram(context);
  }
}
export const arrayFactories: Record<string, DrawFactory> = {
  ARRAY: arrayProgram,
  ARRAYRECT: arrayRectProgram,
  ARRAYPOLAR: arrayPolarProgram,
  ARRAYPATH: arrayPathProgram,
  '-ARRAY': classicArrayProgram,
};
