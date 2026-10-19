import type { DraftTool } from './types';
import type { DrawFactory } from './draw-program';
import { outlineFactories } from './draw-outlines';
import { pointProgram, poly3Program, solidProgram, traceProgram } from './draw-basic';
import { curvePrograms } from './draw-curves';
import { divideProgram, measureProgram } from './draw-divide';
import { mlineProgram } from './draw-mline';
import { extraCurvePrograms } from './draw-extra-curves';
import { regionOutlineFactories } from './draw-region-outlines';

export const drawFactories: Partial<Record<DraftTool, DrawFactory>> = {
  ...outlineFactories,
  ...curvePrograms,
  ...extraCurvePrograms,
  ...regionOutlineFactories,
  POINT: pointProgram,
  '3DPOLY': poly3Program,
  SOLID: solidProgram,
  TRACE: traceProgram,
  DIVIDE: divideProgram,
  MEASURE: measureProgram,
  MLINE: mlineProgram,
};
