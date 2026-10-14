import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';

export type OffsetPrompt =
  | 'offsetDistance'
  | 'offsetSecondPoint'
  | 'offsetSelect'
  | 'offsetSide'
  | 'offsetThrough'
  | 'offsetErase'
  | 'offsetLayer';
export type OffsetError =
  | 'closedSession'
  | 'point'
  | 'positiveDistance'
  | 'selectOffsetObject'
  | 'lockedEntity'
  | 'unsupportedEntity'
  | 'unsupportedPolyline'
  | 'unsupportedGapType'
  | 'invalidGeometry'
  | 'collapsedOffset'
  | 'ambiguousSide'
  | 'throughPoint'
  | 'invalidOption'
  | 'entityLimit'
  | 'nothingToUndo';
export interface OffsetResult {
  error?: OffsetError;
  finish?: boolean;
}
export interface OffsetSnapshot {
  tool: 'OFFSET';
  prompt: OffsetPrompt;
  status: 'active' | 'finished' | 'cancelled';
  inputMode: 'point' | 'entity' | 'number' | 'keyword';
  state: LegacyCadState;
  changed: boolean;
  preview: readonly CadEntity[];
  distance: number;
  through: boolean;
  eraseSource: boolean;
  layerMode: 'Source' | 'Current';
  multiple: boolean;
}
export interface OffsetSessionOptions {
  distance: number;
  gapType: number;
  onDistanceChange?: (distance: number) => void;
}
