import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';

export type DimensionTool =
  'DIMLINEAR' | 'DIMALIGNED' | 'DIMRADIUS' | 'DIMDIAMETER' | 'DIMANGULAR' | 'DIM';
export type DimensionPrompt =
  | 'firstPoint'
  | 'secondPoint'
  | 'placement'
  | 'selectObject'
  | 'selectSecondLine'
  | 'vertex'
  | 'firstRay'
  | 'secondRay'
  | 'circleFirstPoint'
  | 'circleSecondPoint'
  | 'rotationAngle'
  | 'textAngle'
  | 'text';
export type DimensionError =
  | 'point'
  | 'selectCircle'
  | 'selectLineOrArc'
  | 'selectDimensionObject'
  | 'needPoints'
  | 'zeroLength'
  | 'parallelLines'
  | 'invalidAngle'
  | 'closedSession';
export interface DimensionInputResult {
  status: 'continue' | 'committed' | 'cancelled' | 'error';
  error?: DimensionError;
}
export interface DimensionSnapshot {
  tool: DimensionTool;
  mode: 'linear' | 'aligned' | 'radial' | 'angular';
  status: 'active' | 'committed' | 'cancelled';
  prompt: DimensionPrompt;
  inputMode: 'point' | 'entity' | 'number' | 'text';
  points: readonly CadPoint[];
  preview: readonly CadEntity[];
  canClose: false;
}
export interface DimensionSessionOptions {
  onAcceptedPoint?: (point: CadPoint) => void;
  onCommit: (entities: CadEntity[]) => void;
  onChange?: (snapshot: DimensionSnapshot) => void;
}
