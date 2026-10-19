import type { DrawFactory } from './draw-program';
import { breakProgram, explodeProgram, joinProgram, reverseProgram } from './modify-topology';
import { lengthenProgram } from './modify-lengthen';
import { peditProgram } from './modify-poly';
import { splineditProgram } from './modify-spline';

export const curveEditFactories: Readonly<Record<string, DrawFactory>> = {
  BREAK: breakProgram,
  BREAKATPOINT: (context) => breakProgram(context, true),
  JOIN: joinProgram,
  EXPLODE: explodeProgram,
  LENGTHEN: lengthenProgram,
  PEDIT: peditProgram,
  SPLINEDIT: splineditProgram,
  REVERSE: reverseProgram,
};
