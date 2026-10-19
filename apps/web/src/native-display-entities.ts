import {
  databaseBlockDisplayEntities,
  databaseObjectsToDisplay,
  drawingStyleTables,
} from '@hancad/render';
import type { DisplayEntity } from '@hancad/render';
import type { DrawingDatabase } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { nativePropertyIds } from './native-property-state';

/** Only model-space roots are displayed; definition children appear through their INSERT path. */
export function nativeDisplayEntities(
  database: DrawingDatabase,
  state: LegacyCadState,
  lwdefault = 25,
): DisplayEntity[] {
  const all = database.all(),
    model = database.find('BLOCK_RECORD', '*Model_Space')?.handle;
  const ids = nativePropertyIds(database, state);
  const objects = all.filter(
    (o) => !o.fields.hancadClipboardBlock && !o.fields.hancadSelectionEntityId,
  );
  const tables = drawingStyleTables(objects, state);
  const ordinary = databaseObjectsToDisplay(
    objects.filter((o) => o.owner === model && o.type !== 'INSERT'),
  ).entities;
  const blocks = databaseBlockDisplayEntities(objects, tables.layers, lwdefault);
  return [...ordinary, ...blocks].map((entity) => ({
    ...entity,
    id: `native-display:${entity.id}`,
    sourceId:
      ids.get(entity.sourceId ?? entity.id) ?? `native:ENTITY:${entity.sourceId ?? entity.id}`,
  }));
}
