import type { DrawingDatabase } from '@hancad/db';
import type { DocumentManager } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { canUseLocalDrawingCache } from './drawing-session';
import type { DrawingSession } from './drawing-session';
import { cacheNativeDrawing } from './native-drawing-cache';
import { drawingCachePublication } from './cache-publication';
import { readDimensionStyle, saveDimensionStyle } from './dimension-style';
import { readDraftingVariables, saveDraftingVariables } from './drafting-variables';
import {
  drawingStorageKey,
  setDrawingCacheLocation,
  deleteIndexedDrawing,
  writeIndexedDrawing,
} from './drawing-storage';

interface CurrentRef<T> {
  current: T;
}
interface DrawingCachePublicationOptions {
  database: DrawingDatabase;
  manager: DocumentManager | undefined;
  documentId: string | undefined;
  drawing: CurrentRef<DrawingSession>;
  actions: CurrentRef<{ messages: Messages; print: (message: string) => void }>;
  storageWarning: CurrentRef<boolean>;
  indexedNotice: CurrentRef<boolean>;
  hasCachedGeometry: CurrentRef<boolean>;
}
/** Every workspace publishes through the shared queue, preserving replacement/cache ordering. */
export function publishDrawingCache(
  serialized: string,
  options: DrawingCachePublicationOptions,
): void {
  const {
    database,
    manager,
    documentId,
    drawing,
    actions,
    storageWarning,
    indexedNotice,
    hasCachedGeometry,
  } = options;
  if (manager && documentId && manager.active?.id !== documentId) return;
  if (manager && documentId) {
    const activeDocument = manager.all.find((document) => document.id === documentId);
    const session = activeDocument?.titled
      ? { ...drawing.current, fileName: activeDocument.name }
      : drawing.current;
    serialized = JSON.stringify(
      cacheNativeDrawing(session, database, activeDocument?.blobs, activeDocument?.titled),
    );
  }
  hasCachedGeometry.current = true;
  const version = ++drawingCachePublication.version;
  let savedLocally = false;
  try {
    if (canUseLocalDrawingCache(serialized)) {
      localStorage.setItem(drawingStorageKey, serialized);
      setDrawingCacheLocation('local');
      storageWarning.current = false;
      savedLocally = true;
    } else {
      localStorage.removeItem(drawingStorageKey);
      setDrawingCacheLocation('pending');
    }
  } catch {
    try {
      localStorage.removeItem(drawingStorageKey);
    } catch {
      /* Web Storage may be denied entirely. */
    }
    setDrawingCacheLocation('pending');
  }
  try {
    saveDimensionStyle(
      readDimensionStyle((name) => database.getVariable(name)),
      drawing.current.documentId,
    );
    saveDraftingVariables(
      readDraftingVariables((name) => database.getVariable(name)),
      drawing.current.documentId,
    );
  } catch {
    if (!storageWarning.current) actions.current.print(actions.current.messages.autosaveFailed);
    storageWarning.current = true;
  }
  drawingCachePublication.queue = drawingCachePublication.queue.then(async () => {
    if (savedLocally) {
      await deleteIndexedDrawing().catch(() => undefined);
      return;
    }
    try {
      await writeIndexedDrawing(serialized);
      if (version !== drawingCachePublication.version) return;
      setDrawingCacheLocation('indexed');
      storageWarning.current = false;
      if (!indexedNotice.current)
        actions.current.print(actions.current.messages.indexedDrawingSaved);
      indexedNotice.current = true;
    } catch {
      if (version !== drawingCachePublication.version) return;
      await deleteIndexedDrawing().catch(() => undefined);
      setDrawingCacheLocation('failed');
      if (!storageWarning.current) actions.current.print(actions.current.messages.autosaveFailed);
      storageWarning.current = true;
    }
  });
}
