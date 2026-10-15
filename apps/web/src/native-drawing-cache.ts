import { DrawingDatabase } from '@hancad/db';
import type { DrawingSession } from './drawing-session';
import { drawingViewVariable } from './drawing-storage';

/** Recovery payloads wrap the graph; the graph's view stores only the drawing view. */
export function nativeDrawingView(session: DrawingSession): DrawingSession {
  const view = { ...session };
  delete view.nativeDatabase;
  delete view.nativeBlobs;
  delete view.nativeTitled;
  return view;
}

/** Keep the native graph outside its view variable to prevent recursive snapshot growth. */
export function cacheNativeDrawing(
  session: DrawingSession,
  database: DrawingDatabase,
  blobs: ReadonlyMap<string, Uint8Array> = new Map(),
  titled?: boolean,
): DrawingSession {
  const nativeDatabase = database.snapshot();
  delete nativeDatabase.drawingVariables[drawingViewVariable];
  return {
    ...session,
    nativeDatabase,
    nativeBlobs: [...blobs].map(([name, data]) => ({ name, data: Array.from(data) })),
    ...(titled === undefined ? {} : { nativeTitled: titled }),
  };
}

export function cachedNativeDatabase(session: DrawingSession): DrawingDatabase | undefined {
  if (!session.nativeDatabase) return undefined;
  const database = new DrawingDatabase(session.nativeDatabase);
  database.transaction('RESTORE_STYLE', (tx) => {
    for (const [name, value] of Object.entries({
      ...session.dimensionStyle,
      ...session.draftingVariables,
    }))
      tx.setVariable(name, value);
  });
  database.clearHistory();
  return database;
}

export function cachedNativeBlobs(session: DrawingSession): Map<string, Uint8Array> {
  return new Map(
    (session.nativeBlobs ?? []).map(({ name, data }) => [name, Uint8Array.from(data)]),
  );
}
