import { useEffect, useRef, useState } from 'react';
import { readCadFile, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, CadImportDiagnostic, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import { formatCadImportDiagnostic } from '@hancad/ui';
import type { Messages } from '@hancad/ui';
import type { DrawingDatabase } from '@hancad/db';
import {
  drawingViewVariable,
  getDrawingCacheLocation,
  readIndexedDrawing,
  restoreCachedDrawingSession,
} from './drawing-storage';
import type { DrawingSession } from './drawing-storage';
import { dimensionStyleFields, readDimensionStyle, saveDimensionStyle } from './dimension-style';
import {
  draftingVariableNames,
  readDraftingVariables,
  saveDraftingVariables,
} from './drafting-variables';
import type { SysvarValue } from '@hancad/sysvars';
import { DrawingSessionTransfer } from './drawing-session';
import { errorMessage } from './error-presenter';
import {
  initialDocumentDrawing,
  createImportedDocument,
  openNativeDocument,
} from './document-actions';
import type { DocumentManager } from '@hancad/sysvars';
import { drawingErasureHistory, rememberDrawingErasure } from './erasure-history';
import { cachedNativeDatabase, cachedNativeBlobs, nativeDrawingView } from './native-drawing-cache';
import { publishDrawingCache } from './publish-drawing-cache';
import { useDrawingFileCommands } from './useDrawingFileCommands';
import { setDocumentSource } from './document-source';
import { useDrawingFileNotice } from './useDrawingFileNotice';
import { viewVariables } from './view-history';
import { syncClipboardBlockRecords } from './clipboard-block-records';
import { syncSelectionGroupRecords } from './selection-group-records';
import { syncLayerRecords } from './layers/layer-records';

interface DrawingFilesOptions {
  registry: CommandRegistry;
  database: DrawingDatabase;
  messages: Messages;
  print: (message: string) => void;
  documentName?: string;
  restoreLocal?: boolean;
  newDocument?: () => void;
  manager?: DocumentManager;
  documentId?: string;
  notice?: 'restored' | 'opened';
  consumeNotice?: () => void;
}

export function useDrawingFiles({
  registry,
  database,
  messages,
  print,
  documentName = 'Drawing1.dwg',
  restoreLocal = true,
  newDocument,
  manager,
  documentId,
  notice,
  consumeNotice,
}: DrawingFilesOptions) {
  const [initial] = useState(() => initialDocumentDrawing(database, documentName, restoreLocal));
  const [transfer] = useState(() => new DrawingSessionTransfer());
  const [drawing, setDrawing] = useState<DrawingSession>(initial.drawing);
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState<string | CadImportDiagnostic>('');
  const [fitRevision, setFitRevision] = useState(0);
  const fitNext = useRef(false);
  const drawingRef = useRef(initial.drawing);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const lastErased = useRef<readonly CadEntity[]>(drawingErasureHistory.get(database) ?? []);
  const storageWarning = useRef(false);
  const indexedNotice = useRef(false);
  const documentGeneration = useRef(0);
  const skipPersistence = useRef(false);
  const hasCachedGeometry = useRef(initial.restored);
  const actions = useRef({ messages, print, drawing });
  actions.current = { messages, print, drawing };

  useDrawingFileNotice({ initial, database, messages, print, documentName, notice, consumeNotice });
  useEffect(() => () => controller.current?.abort(), []);

  function persist(serialized: string): void {
    publishDrawingCache(serialized, {
      database,
      manager,
      documentId,
      drawing: drawingRef,
      actions,
      storageWarning,
      indexedNotice,
      hasCachedGeometry,
    });
  }
  useEffect(() => {
    let initializing = true;
    let disposed = false;
    let styleQueued = false;
    function scheduleStyle(): void {
      if (initializing || styleQueued) return;
      styleQueued = true;
      queueMicrotask(() => {
        styleQueued = false;
        if (disposed) return;
        const dimensionStyle = readDimensionStyle((name) => database.getVariable(name));
        const draftingVariables = readDraftingVariables((name) => database.getVariable(name));
        if (
          JSON.stringify(drawingRef.current.dimensionStyle) === JSON.stringify(dimensionStyle) &&
          JSON.stringify(drawingRef.current.draftingVariables) === JSON.stringify(draftingVariables)
        )
          return;
        const next = { ...drawingRef.current, dimensionStyle, draftingVariables };
        drawingRef.current = next;
        setDrawing(next);
        documentGeneration.current++;
        if (!hasCachedGeometry.current) {
          const serialized = database.getVariable(drawingViewVariable);
          if (typeof serialized === 'string') persist(serialized);
        }
        try {
          saveDimensionStyle(dimensionStyle, next.documentId);
          saveDraftingVariables(draftingVariables, next.documentId);
        } catch {
          if (!storageWarning.current)
            actions.current.print(actions.current.messages.autosaveFailed);
          storageWarning.current = true;
        }
      });
    }
    const unsubscribe = database.events.subscribe((event) => {
      if (
        event.type === 'sysvar-changed' &&
        (dimensionStyleFields.some(([name]) => name === event.name) ||
          draftingVariableNames.some((name) => name === event.name))
      ) {
        scheduleStyle();
        return;
      }
      if (
        event.type === 'sysvar-changed' &&
        event.name !== drawingViewVariable &&
        !viewVariables.some((name) => name === event.name) &&
        !initializing &&
        manager
      ) {
        queueMicrotask(() => {
          if (!disposed) {
            const current = database.getVariable(drawingViewVariable);
            if (typeof current === 'string') persist(current);
          }
        });
      }
      if (
        event.type !== 'sysvar-changed' ||
        event.name !== drawingViewVariable ||
        typeof event.value !== 'string'
      )
        return;
      const next = transfer.read(event.value);
      drawingRef.current = next;
      setDrawing(next);
      if (fitNext.current) {
        setFitRevision((value) => value + 1);
        fitNext.current = false;
      }
      if (!initializing) {
        documentGeneration.current++;
        if (!skipPersistence.current) persist(event.value);
        scheduleStyle();
      }
    });
    if (typeof database.getVariable(drawingViewVariable) !== 'string') {
      transfer.write(initial.drawing, (serialized) => {
        database.transaction('INITIAL_VIEW', (transaction) => {
          for (const [name, value] of Object.entries(initial.drawing.dimensionStyle ?? {}))
            transaction.setVariable(name, value);
          for (const [name, value] of Object.entries(initial.drawing.draftingVariables ?? {}))
            transaction.setVariable(name, value);
          transaction.setVariable(drawingViewVariable, serialized);
        });
      });
      database.clearHistory();
    }
    initializing = false;
    if (initial.reused || !restoreLocal) {
      const serialized = database.getVariable(drawingViewVariable);
      if (typeof serialized === 'string') persist(serialized);
    }
    if (initial.identityMigrated) {
      const serialized = database.getVariable(drawingViewVariable);
      if (typeof serialized === 'string') persist(serialized);
    }
    const generation = documentGeneration.current;
    if (!initial.restored && restoreLocal) {
      const location = getDrawingCacheLocation();
      if (location === 'failed' || location === 'pending') {
        if (!initial.failed) print(messages.restoreFailed);
      } else if (location !== 'local') {
        if (location === 'indexed') setRestoring(true);
        void readIndexedDrawing()
          .then((serialized) => {
            if (!serialized || disposed || documentGeneration.current !== generation) return;
            const restored = restoreCachedDrawingSession(serialized);
            const native = cachedNativeDatabase(restored.drawing);
            if (native && manager) {
              native.transaction('RESTORE', (tx) =>
                tx.setVariable(
                  drawingViewVariable,
                  JSON.stringify(nativeDrawingView(restored.drawing)),
                ),
              );
              native.clearHistory();
              manager.create(
                native,
                restored.drawing.fileName || restored.drawing.state.name,
                cachedNativeBlobs(restored.drawing),
                'restored',
                restored.drawing.nativeTitled ?? Boolean(restored.drawing.fileName),
              );
              return;
            }
            skipPersistence.current = !restored.identityMigrated;
            try {
              commitDrawing('RESTORE', restored.drawing, true);
              hasCachedGeometry.current = true;
              actions.current.print(actions.current.messages.restoredDrawing);
            } finally {
              skipPersistence.current = false;
            }
          })
          .catch(() => {
            if (!disposed && documentGeneration.current === generation && location === 'indexed')
              actions.current.print(actions.current.messages.restoreFailed);
          })
          .finally(() => {
            if (!disposed) setRestoring(false);
          });
      }
    }
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [database]);

  function commitDrawing(
    label: string,
    next: DrawingSession,
    newBase = false,
    fit = false,
    variables?: Readonly<Record<string, SysvarValue>>,
  ): void {
    if (!next.documentId || (newBase && label !== 'RESTORE'))
      next = { ...next, documentId: crypto.randomUUID() };
    if (newBase && !next.dimensionStyle)
      next = { ...next, dimensionStyle: readDimensionStyle(() => undefined) };
    if (newBase && !next.draftingVariables)
      next = { ...next, draftingVariables: readDraftingVariables(() => undefined) };
    const previousFit = fitNext.current;
    try {
      // Validate before writing; the synchronous journal observer reuses this exact validated graph.
      transfer.write(next, (serialized) => {
        fitNext.current = newBase || fit;
        database.transaction(label, (transaction) => {
          for (const [name, value] of Object.entries(
            variables ?? (newBase ? { ...next.dimensionStyle, ...next.draftingVariables } : {}),
          ))
            transaction.setVariable(name, value);
          syncClipboardBlockRecords(database, transaction, next.state);
          syncSelectionGroupRecords(database, transaction, next.state);
          syncLayerRecords(database, transaction, next.state);
          transaction.setVariable(drawingViewVariable, serialized);
        });
      });
    } catch (error) {
      fitNext.current = previousFit;
      throw error;
    }
    if (newBase) database.clearHistory();
  }
  function commitState(
    label: string,
    state: LegacyCadState,
    variables?: Readonly<Record<string, SysvarValue>>,
  ): void {
    if (label === 'ERASE') {
      lastErased.current = rememberDrawingErasure(
        database,
        drawingRef.current.state.entities,
        state.entities,
      );
    }
    const get = (name: string): unknown => variables?.[name] ?? database.getVariable(name);
    const dimensionStyle = readDimensionStyle(get);
    const draftingVariables = readDraftingVariables(get);
    commitDrawing(
      label,
      { ...drawingRef.current, state, dimensionStyle, draftingVariables },
      false,
      false,
      variables,
    );
  }

  async function openFile(file: File): Promise<void> {
    documentGeneration.current++;
    setRestoring(false);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setReading(true);
    setProgress('');
    try {
      if (/\.hcd$/i.test(file.name) && manager) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (current.signal.aborted || controller.current !== current) return;
        openNativeDocument(manager, bytes, file.name);
        return;
      }
      const imported = await readCadFile(file, {
        signal: current.signal,
        onProgress: (message) => {
          if (controller.current === current) setProgress(message);
        },
        onDiagnosticProgress: (diagnostic) => {
          if (controller.current === current) setProgress(diagnostic);
        },
      });
      if (current.signal.aborted || controller.current !== current) return;
      const next = { state: imported.state, report: imported.report, fileName: file.name };
      if (manager) {
        const document = createImportedDocument(manager, next);
        setDocumentSource(document.database, imported.source);
        return;
      }
      commitDrawing('OPEN', next, true);
      setDocumentSource(database, imported.source);
      const active = actions.current;
      active.print(active.messages.importFinished(file.name, imported.state.entities.length));
    } catch (error) {
      if (controller.current !== current) return;
      const active = actions.current;
      active.print(
        typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'AbortError'
          ? active.messages.importCancelled
          : active.messages.commandFailure(errorMessage(error, active.messages)),
      );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setReading(false);
        setProgress('');
      }
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  useDrawingFileCommands({
    registry,
    database,
    messages,
    fileInput,
    controller,
    lastErased,
    getDrawing: () => drawingRef.current,
    print: (message) => actions.current.print(message),
    commitDrawing,
    commitState,
    newDocument,
    manager,
    documentId,
  });
  const visibleCount = visibleCadEntities(drawing.state).length;
  return {
    ...drawing,
    reading,
    restoring,
    progress:
      typeof progress === 'string'
        ? progress
        : formatCadImportDiagnostic(progress, messages.importDiagnostics),
    fileInput,
    openFile,
    commitState,
    getState: () => drawingRef.current.state,
    fitRevision,
    visibleCount,
    hiddenAll: drawing.state.entities.length > 0 && visibleCount === 0,
    cancelImport: () => controller.current?.abort(),
    cancelRestore: (notify = true) => {
      documentGeneration.current++;
      setRestoring(false);
      if (notify) print(messages.restoreCancelled);
    },
  };
}
