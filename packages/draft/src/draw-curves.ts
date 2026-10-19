import type { DrawFactory } from './draw-program';
import { arcProgram } from './draw-arc';
import { circleProgram } from './draw-circle';
import { xlineProgram, rayProgram } from './draw-construction';
import { ellipseProgram } from './draw-ellipse';
import { splineProgram } from './draw-spline';

export const curvePrograms: Readonly<Record<string, DrawFactory>> = {
  ARC: arcProgram,
  CIRCLE: circleProgram,
  ELLIPSE: ellipseProgram,
  SPLINE: splineProgram,
  XLINE: xlineProgram,
  RAY: rayProgram,
};
