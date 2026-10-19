import type { DraftTool } from './types';
import type { DrawFactory } from './draw-program';
import { outlineFactories } from './draw-outlines';
import { pointProgram, poly3Program, solidProgram, traceProgram } from './draw-basic';
import { curvePrograms } from './draw-curves';
import { divideProgram, measureProgram } from './draw-divide';
import { mlineProgram } from './draw-mline';
import { extraCurvePrograms } from './draw-extra-curves';
import { regionOutlineFactories } from './draw-region-outlines';
import { transformFactories } from './modify-transform';
import { arrayFactories } from './modify-array';
import { offsetFactories } from './modify-offset';
import { cornerFactories } from './modify-corner';
import { curveEditFactories } from './modify-curve-edit';
import { propertyFactories } from './modify-properties';
import { overkillFactories } from './modify-overkill';
import { overkillDialogFactory } from './overkill-dialog-program';

export const drawFactories: Partial<Record<DraftTool, DrawFactory>> = {
  ...transformFactories,
  ...arrayFactories,
  ...offsetFactories,
  ...cornerFactories,
  ...curveEditFactories,
  ...propertyFactories,
  ...overkillFactories,
  OVERKILL: overkillDialogFactory,
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
