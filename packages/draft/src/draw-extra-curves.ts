import type { DrawFactory } from './draw-program';
import { helixProgram } from './draw-helix';
import { sketchProgram } from './draw-sketch';

export const extraCurvePrograms: Readonly<Record<string, DrawFactory>> = {
  HELIX: helixProgram,
  SKETCH: sketchProgram,
};
