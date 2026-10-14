import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';

export type DraftTool = 'LINE' | 'CIRCLE' | 'RECTANG' | 'PLINE';
export type DraftPrompt = 'firstPoint' | 'nextPoint' | 'oppositeCorner' | 'center' | 'radius';
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
}
export interface DraftSessionOptions {
  onCommit: (entities: CadEntity[]) => void;
  onChange?: (snapshot: DraftSnapshot) => void;
}
