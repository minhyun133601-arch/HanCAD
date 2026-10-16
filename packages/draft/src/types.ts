import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { CoordinateSettings, DraftPoint } from './coordinates';
import type { PointInputState, PointSnapOverride } from './point-input';
import type { DraftSnapDeferred } from './snap-types';

export type DraftTool = 'LINE' | 'CIRCLE' | 'RECTANG' | 'PLINE';
export type DraftPrompt =
  | 'firstPoint'
  /** LINE before its second segment: Undo only. */
  | 'nextPointUndo'
  | 'nextPoint'
  | 'oppositeCorner'
  | 'center'
  | 'radius';
export type DraftError = 'point' | 'positiveRadius' | 'needPoints' | 'zeroLength' | 'closedSession';
export interface DraftInputResult {
  status: 'continue' | 'committed' | 'cancelled' | 'error';
  error?: DraftError;
}
export interface DraftSnapshot {
  tool: DraftTool;
  status: 'active' | 'committed' | 'cancelled';
  prompt: DraftPrompt;
  points: readonly CadPoint[];
  preview: readonly CadEntity[];
  canClose: boolean;
  pointInput: PointInputState;
}
export interface DraftSessionOptions {
  coordinates?: () => Partial<CoordinateSettings>;
  continuation?: { point: DraftPoint; tangent?: CadPoint };
  onSnapOverride?: (mode: PointSnapOverride) => void;
  onTrackingPoint?: (point: DraftPoint) => void;
  onAcceptedPoint?: (point: CadPoint) => void;
  onCommit: (entities: CadEntity[]) => void;
  onChange?: (snapshot: DraftSnapshot) => void;
}
export interface DraftPointOptions {
  /** Exact object snaps take precedence over grid and Ortho constraints. */
  snapped?: boolean;
  /** The shared application aid controller has already applied grid/polar/Ortho. */
  constrained?: boolean;
  trackingBase?: CadPoint;
  deferred?: DraftSnapDeferred;
}
