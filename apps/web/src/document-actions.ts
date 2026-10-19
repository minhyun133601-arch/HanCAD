import { systemVariableDefinitions, SystemVariableError } from '@hancad/sysvars';
import type { DocumentManager, DrawingDocument } from '@hancad/sysvars';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { DrawingDatabase, deserializeHcd } from '@hancad/db';
import { drawingViewVariable, parseDrawingSession, restoreDrawing } from './drawing-storage';
import { normalizeDrawingSession } from './drawing-session';
import type { DrawingSession } from './drawing-session';
import { readDimensionStyle } from './dimension-style';
import { readDraftingVariables } from './drafting-variables';
import { NativeDrawingFileError } from './native-file-error';
import { nativeDrawingView } from './native-drawing-cache';
import { endTemporaryObjectIsolation } from './temporary-object-isolation';

export function createDocument(manager: DocumentManager): DrawingDocument {
  const previous = manager.active;
  const document = manager.create();
  // Remembered unsaved input defaults carry into NEW; each document keeps its own session state.
  if (previous)
    for (const definition of systemVariableDefinitions) {
      if (definition.scope !== 'session' || definition.readonly) continue;
      try {
        document.sysvars.set(definition.name, previous.sysvars.get(definition.name));
      } catch (error) {
        if (!(error instanceof SystemVariableError) || error.code !== 'unavailable') throw error;
      }
    }
  return document;
}

export function initialDocumentDrawing(
  database: DrawingDatabase,
  name: string,
  restoreLocal: boolean,
) {
  return readInitialDocumentDrawing(database, name, restoreLocal);
}

export function createImportedDocument(
  manager: DocumentManager,
  input: DrawingSession,
): DrawingDocument {
  const drawing = normalizeDrawingSession({
    ...input,
    documentId: crypto.randomUUID(),
    dimensionStyle: readDimensionStyle(() => undefined),
    draftingVariables: readDraftingVariables(() => undefined),
  });
  const database = new DrawingDatabase();
  database.transaction('OPEN', (tx) => {
    for (const [name, value] of Object.entries({
      ...drawing.dimensionStyle,
      ...drawing.draftingVariables,
    }))
      tx.setVariable(name, value);
    tx.setVariable(drawingViewVariable, JSON.stringify(drawing));
  });
  database.clearHistory();
  return manager.create(database, input.fileName, new Map(), 'opened');
}

export function openNativeDocument(
  manager: DocumentManager,
  bytes: Uint8Array,
  name: string,
): DrawingDocument {
  try {
    const loaded = deserializeHcd(bytes);
    const view = loaded.database.getVariable(drawingViewVariable);
    if (typeof view === 'string') {
      const original = parseDrawingSession(view);
      const reopened = endTemporaryObjectIsolation(original);
      if (reopened !== original) {
        loaded.database.transaction('OPEN', (tx) =>
          tx.setVariable(drawingViewVariable, JSON.stringify(reopened)),
        );
        loaded.database.clearHistory();
      }
    }
    return manager.create(loaded.database, name, loaded.blobs, 'opened');
  } catch (error) {
    throw new NativeDrawingFileError(error);
  }
}

function readInitialDocumentDrawing(
  database: DrawingDatabase,
  name: string,
  restoreLocal: boolean,
) {
  const serialized = database.getVariable(drawingViewVariable);
  if (typeof serialized === 'string')
    return {
      drawing: {
        ...nativeDrawingView(parseDrawingSession(serialized)),
        dimensionStyle: readDimensionStyle((variable) => database.getVariable(variable)),
        draftingVariables: readDraftingVariables((variable) => database.getVariable(variable)),
      },
      restored: true,
      failed: false,
      identityMigrated: false,
      reused: true,
    };
  if (restoreLocal) {
    const restored = restoreDrawing();
    return { ...restored, drawing: endTemporaryObjectIsolation(restored.drawing), reused: false };
  }
  return {
    drawing: {
      state: createEmptyCadState(name),
      fileName: '',
      report: null,
      documentId: crypto.randomUUID(),
    },
    restored: false,
    failed: false,
    identityMigrated: false,
    reused: false,
  };
}
