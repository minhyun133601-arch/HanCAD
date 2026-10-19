import type { DrawFactory } from './draw-program';
import { moveProgram, copyProgram } from './modify-transform-move';
import { rotateProgram, scaleProgram } from './modify-transform-reference';
import { mirrorProgram, stretchProgram } from './modify-transform-stretch';
import { alignProgram } from './modify-transform-align';

export const transformFactories: Record<string, DrawFactory> = {
  MOVE: moveProgram,
  COPY: copyProgram,
  ROTATE: rotateProgram,
  SCALE: scaleProgram,
  MIRROR: mirrorProgram,
  STRETCH: stretchProgram,
  ALIGN: alignProgram,
};
