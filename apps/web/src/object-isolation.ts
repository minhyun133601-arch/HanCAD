import type { LegacyCadState } from '@hancad/legacy-bridge';

export interface ObjectIsolationSnapshot {
  hiddenIds: string[];
  persistent: boolean;
}
export type ObjectIsolationState = LegacyCadState & {
  objectIsolation?: ObjectIsolationSnapshot;
};

export function isolatedObjectIds(state: LegacyCadState): readonly string[] {
  return (state as ObjectIsolationState).objectIsolation?.hiddenIds ?? [];
}

/** Isolation changes visibility only and retains an earlier hide/isolate operation. */
export function isolateObjects(
  state: LegacyCadState,
  ids: readonly string[],
  command: 'ISOLATEOBJECTS' | 'HIDEOBJECTS',
  isolationMode: number,
): ObjectIsolationState {
  const selected = new Set(ids),
    present = new Set(state.entities.map((entity) => entity.id));
  if (![...selected].some((id) => present.has(id))) return state;
  const hidden = new Set(isolatedObjectIds(state).filter((id) => present.has(id)));
  for (const entity of state.entities)
    if (command === 'ISOLATEOBJECTS' ? !selected.has(entity.id) : selected.has(entity.id))
      hidden.add(entity.id);
  return { ...state, objectIsolation: { hiddenIds: [...hidden], persistent: isolationMode === 1 } };
}

export function unisolateObjects(state: LegacyCadState): ObjectIsolationState {
  const next: ObjectIsolationState = { ...state };
  delete next.objectIsolation;
  return next;
}

/** Call only when opening a drawing, never during a current-session Undo/Redo. */
export function restoreObjectIsolation(state: LegacyCadState): ObjectIsolationState {
  const snapshot = (state as ObjectIsolationState).objectIsolation;
  if (!snapshot?.persistent) return unisolateObjects(state);
  const present = new Set(state.entities.map((entity) => entity.id));
  return {
    ...state,
    objectIsolation: { ...snapshot, hiddenIds: snapshot.hiddenIds.filter((id) => present.has(id)) },
  };
}
