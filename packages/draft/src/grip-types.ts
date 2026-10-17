import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CoordinateProvider } from './coordinates';
import type { PointInputState, PointSnapOverride } from './point-input';

export type GripMode = 'STRETCH' | 'MOVE' | 'ROTATE' | 'SCALE' | 'MIRROR';
export const gripModes: readonly GripMode[] = ['STRETCH', 'MOVE', 'ROTATE', 'SCALE', 'MIRROR'];
export type GripAction =
  'stretch' | 'lengthen' | 'addVertex' | 'removeVertex' | 'convertArc' | 'convertLine';
export interface EntityGrip {
  entityId: string;
  key: string;
  point: CadPoint;
  kind: 'vertex' | 'midpoint' | 'center' | 'quadrant' | 'insertion';
  actions: readonly GripAction[];
  entityIds?: readonly string[];
}
export interface DisplayGrip extends EntityGrip {
  hot: boolean;
  hover: boolean;
}
/** New entity families provide exact grips and local stretch behavior here. */
export interface GripProvider {
  supports(entity: CadEntity): boolean;
  grips(entity: CadEntity, extra: boolean): EntityGrip[];
  stretch(entity: CadEntity, keys: readonly string[], delta: CadPoint): CadEntity;
}
export interface GripSessionOptions {
  coordinates?: CoordinateProvider;
  resolveTypedPoint?: (point: CadPoint, override?: PointSnapOverride) => CadPoint | null;
  onSnapOverride?: (override: PointSnapOverride) => void;
  onAcceptedPoint?: (point: CadPoint) => void;
  mirrorText?: () => boolean;
  getSnapOverride?: () => PointSnapOverride | undefined;
  copyGroups?: () => boolean;
}
export interface GripSnapshot {
  mode: GripMode;
  basePoint: CadPoint;
  prompt: string;
  preview: readonly CadEntity[];
  previewHiddenIds: readonly string[];
  needsPoint: boolean;
  inputMode: 'point' | 'number';
  pointInput: PointInputState;
  copy: boolean;
  changed: boolean;
}
export interface GripResult {
  error?: boolean;
  finish?: boolean;
  accepted?: boolean;
}
export interface GripSettings {
  grips: number;
  limit: number;
  multifunctional: number;
  block?: number;
  groupMode?: number;
  pickstyle?: number;
}
export type GripStateCommit = (state: LegacyCadState) => void;
