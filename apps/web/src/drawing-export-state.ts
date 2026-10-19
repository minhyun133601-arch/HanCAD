import type { DrawingDatabase } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';

/** Plot visibility is drawing state; the entity's creation metadata remains unchanged. */
export function drawingExportState(
  state: LegacyCadState,
  database: Pick<DrawingDatabase, 'getVariable'>,
): LegacyCadState {
  const value = database.getVariable('WIPEOUTFRAME');
  const frameMode = value === 0 || value === 2 ? value : 1;
  return {
    ...state,
    entities: state.entities.map((entity) =>
      entity.sourceType === 'WIPEOUT' ? { ...entity, frameMode } : entity,
    ),
  };
}
