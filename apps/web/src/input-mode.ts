import type { PromptInputMode } from '@hancad/input';

/** Session-level prompt kinds use the ImeController vocabulary from @hancad/input. */
export type SessionInputKind = 'point' | 'entity' | 'number' | 'keyword' | 'text';

export function sessionInputMode(kind: SessionInputKind | undefined): PromptInputMode {
  if (kind === 'entity') return 'selection';
  if (kind === 'text' || kind === 'number' || kind === 'keyword') return kind;
  return 'point';
}

interface ToolStates {
  editing?: { inputMode: SessionInputKind } | null;
  text?: { inputMode: SessionInputKind } | null;
  dimensions?: { inputMode: SessionInputKind } | null;
  modification?: { needsPoint: boolean } | null;
  measuring: boolean;
  drafting: boolean;
  selecting: boolean;
}

/** The first active tool owns the prompt, in the same order as its prompt text. */
export function toolInputMode(state: ToolStates): PromptInputMode | undefined {
  if (state.editing) return sessionInputMode(state.editing.inputMode);
  if (state.text) return sessionInputMode(state.text.inputMode);
  if (state.dimensions) return sessionInputMode(state.dimensions.inputMode);
  if (state.modification) return state.modification.needsPoint ? 'point' : 'selection';
  if (state.measuring || state.drafting) return 'point';
  if (state.selecting) return 'selection';
  return undefined;
}
