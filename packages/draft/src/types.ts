import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { CoordinateSettings, DraftPoint } from './coordinates';
import type { PointInputState, PointSnapOverride } from './point-input';
import type { DraftSnapDeferred } from './snap-types';

export type DraftTool =
  | 'LINE'
  | 'CIRCLE'
  | 'RECTANG'
  | 'PLINE'
  | 'POLYGON'
  | 'DONUT'
  | 'ARC'
  | 'ELLIPSE'
  | 'SPLINE'
  | 'XLINE'
  | 'RAY'
  | 'POINT'
  | 'CIRCLETANTANTAN'
  | 'DIVIDE'
  | 'MEASURE'
  | 'REVCLOUD'
  | 'WIPEOUT'
  | 'REGION'
  | 'SKETCH'
  | 'HELIX'
  | 'SOLID'
  | 'TRACE'
  | '3DPOLY'
  | 'MLINE'
  | 'MLSTYLE';
export type DraftPrompt =
  | 'firstPoint'
  /** LINE before its second segment: Undo only. */
  | 'nextPointUndo'
  | 'nextPoint'
  | 'oppositeCorner'
  | 'center'
  | 'radius';
export type DraftError =
  'point' | 'positiveRadius' | 'needPoints' | 'noContinuation' | 'zeroLength' | 'closedSession';
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
  promptText?: { ko: string; en: string };
  inputMode?: 'point' | 'number' | 'keyword' | 'selection' | 'text';
  scalarKind?: 'angle' | 'distance';
}
export interface DraftSessionOptions {
  coordinates?: () => Partial<CoordinateSettings>;
  resolveTypedPoint?: (
    point: DraftPoint,
    override?: PointSnapOverride,
  ) => ({ point: DraftPoint } & DraftPointOptions) | undefined;
  getSnapOverride?: () => PointSnapOverride | undefined;
  continuation?: { point: DraftPoint; tangent?: CadPoint };
  onSnapOverride?: (mode: PointSnapOverride) => void;
  onTrackingPoint?: (point: DraftPoint) => void;
  onAcceptedPoint?: (point: CadPoint) => void;
  /** Includes modifier reference samples, which do not become geometry or LASTPOINT. */
  onPointSampleAccepted?: () => void;
  onCommit: (entities: CadEntity[]) => void;
  onChange?: (snapshot: DraftSnapshot) => void;
}
export interface DraftTextOptions {
  source?: 'keyboard' | 'script';
}
export interface DraftPointOptions {
  /** A locked scalar dynamic field supersedes a geometric mouse sample. */
  scalar?: string;
  /** Exact object snaps take precedence over grid and Ortho constraints. */
  snapped?: boolean;
  /** The shared application aid controller has already applied grid/polar/Ortho. */
  constrained?: boolean;
  trackingBase?: CadPoint;
  deferred?: DraftSnapDeferred;
}
