import { useEffect, useRef, useState } from 'react';
import { createEmptyCadState, readCadFile, visibleCadEntities } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { exportCadDrawing } from '@hancad/io-pdf';
import type { CommandRegistry } from '@hancad/commands';
import { getMessages } from '@hancad/ui';
import type { Messages } from '@hancad/ui';
import type { DrawingDatabase } from '@hancad/db';
import {
  drawingStorageKey,
  drawingViewVariable,
  deleteIndexedDrawing,
  getDrawingCacheLocation,
  readIndexedDrawing,
  restoreDrawing,
  restoreCachedDrawingSession,
  setDrawingCacheLocation,
  writeIndexedDrawing,
} from './drawing-storage';
import type { DrawingSession } from './drawing-storage';
import { dimensionStyleFields, readDimensionStyle, saveDimensionStyle } from './dimension-style';
import type { DimensionStyleValues } from './dimension-style';
import { canUseLocalDrawingCache, DrawingSessionTransfer } from './drawing-session';

type ExportFormat = 'pdf' | 'png' | 'jpg' | 'svg' | 'dxf';
interface DrawingFilesOptions {
  registry: CommandRegistry;
  database: DrawingDatabase;
  messages: Messages;
  print: (message: string) => void;
}

export function useDrawingFiles({ registry, database, messages, print }: DrawingFilesOptions) {
  const [initial] = useState(restoreDrawing);
  const [transfer] = useState(() => new DrawingSessionTransfer());
  const [drawing, setDrawing] = useState<DrawingSession>(initial.drawing);
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState('');
  const [fitRevision, setFitRevision] = useState(0);
  const fitNext = useRef(false);
  const drawingRef = useRef(initial.drawing);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const originalSource = useRef<unknown>(null);
  const restoredNotice = useRef(false);
  const storageWarning = useRef(false);
  const indexedNotice = useRef(false);
  const cacheVersion = useRef(0);
  const documentGeneration = useRef(0);
  const cacheQueue = useRef<Promise<void>>(Promise.resolve());
  const skipPersistence = useRef(false);
  const hasCachedGeometry = useRef(initial.restored);
  const actions = useRef({ messages, print, drawing });
  actions.current = { messages, print, drawing };

  useEffect(() => {
    if (restoredNotice.current) return;
    restoredNotice.current = true;
    if (initial.failed) print(messages.restoreFailed);
    else if (initial.restored) print(messages.restoredDrawing);
  }, [initial]);
  useEffect(() => () => controller.current?.abort(), []);

  function persist(serialized: string): void {
    hasCachedGeometry.current = true;
    const version = ++cacheVersion.current;
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
        // The browser may deny Web Storage entirely.
      }
      setDrawingCacheLocation('pending');
    }
    try {
      saveDimensionStyle(
        readDimensionStyle((name) => database.getVariable(name)),
        drawingRef.current.documentId,
      );
    } catch {
      if (!storageWarning.current) actions.current.print(actions.current.messages.autosaveFailed);
      storageWarning.current = true;
    }
    cacheQueue.current = cacheQueue.current.then(async () => {
      if (savedLocally) {
        await deleteIndexedDrawing().catch(() => undefined);
        return;
      }
      try {
        await writeIndexedDrawing(serialized);
        if (version !== cacheVersion.current) return;
        setDrawingCacheLocation('indexed');
        storageWarning.current = false;
        if (!indexedNotice.current)
          actions.current.print(actions.current.messages.indexedDrawingSaved);
        indexedNotice.current = true;
      } catch {
        await deleteIndexedDrawing().catch(() => undefined);
        if (version !== cacheVersion.current) return;
        setDrawingCacheLocation('failed');
        if (!storageWarning.current) actions.current.print(actions.current.messages.autosaveFailed);
        storageWarning.current = true;
      }
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
        if (JSON.stringify(drawingRef.current.dimensionStyle) === JSON.stringify(dimensionStyle))
          return;
        const next = { ...drawingRef.current, dimensionStyle };
        drawingRef.current = next;
        setDrawing(next);
        documentGeneration.current++;
        if (!hasCachedGeometry.current) {
          const serialized = database.getVariable(drawingViewVariable);
          if (typeof serialized === 'string') persist(serialized);
        }
        try {
          saveDimensionStyle(dimensionStyle, next.documentId);
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
        dimensionStyleFields.some(([name]) => name === event.name)
      ) {
        scheduleStyle();
        return;
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
          transaction.setVariable(drawingViewVariable, serialized);
        });
      });
      database.clearHistory();
    }
    initializing = false;
    if (initial.identityMigrated) {
      const serialized = database.getVariable(drawingViewVariable);
      if (typeof serialized === 'string') persist(serialized);
    }
    const generation = documentGeneration.current;
    if (!initial.restored) {
      const location = getDrawingCacheLocation();
      if (location === 'failed' || location === 'pending') {
        if (!initial.failed) print(messages.restoreFailed);
      } else if (location !== 'local') {
        if (location === 'indexed') setRestoring(true);
        void readIndexedDrawing()
          .then((serialized) => {
            if (!serialized || disposed || documentGeneration.current !== generation) return;
            const restored = restoreCachedDrawingSession(serialized);
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
    variables?: DimensionStyleValues,
  ): void {
    if (!next.documentId || (newBase && label !== 'RESTORE'))
      next = { ...next, documentId: crypto.randomUUID() };
    if (newBase && !next.dimensionStyle)
      next = { ...next, dimensionStyle: readDimensionStyle(() => undefined) };
    const previousFit = fitNext.current;
    try {
      // Validate before writing; the synchronous journal observer reuses this exact validated graph.
      transfer.write(next, (serialized) => {
        fitNext.current = newBase || fit;
        database.transaction(label, (transaction) => {
          for (const [name, value] of Object.entries(
            variables ?? (newBase ? (next.dimensionStyle ?? {}) : {}),
          ))
            transaction.setVariable(name, value);
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
    variables?: DimensionStyleValues,
  ): void {
    const dimensionStyle = variables ?? readDimensionStyle((name) => database.getVariable(name));
    commitDrawing(label, { ...drawingRef.current, state, dimensionStyle }, false, false, variables);
  }

  async function openFile(file: File): Promise<void> {
    documentGeneration.current++;
    setRestoring(false);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setReading(true);
    setProgress(messages.importing);
    try {
      const imported = await readCadFile(file, {
        signal: current.signal,
        onProgress: (message) => {
          if (controller.current === current) setProgress(message);
        },
      });
      if (current.signal.aborted || controller.current !== current) return;
      const next = { state: imported.state, report: imported.report, fileName: file.name };
      commitDrawing('OPEN', next, true);
      originalSource.current = imported.source;
      print(messages.importFinished(file.name, imported.state.entities.length));
    } catch (error) {
      if (controller.current !== current) return;
      print(
        error instanceof Error && error.name === 'AbortError'
          ? messages.importCancelled
          : messages.commandFailure(error instanceof Error ? error.message : String(error)),
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

  async function exportDrawing(format: ExportFormat): Promise<void> {
    const active = actions.current;
    if (!active.drawing.state.entities.length) throw new Error(active.messages.noDrawing);
    const result = await exportCadDrawing(active.drawing.state, format);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    active.print(active.messages.exportFinished(result.fileName));
  }

  useEffect(() => {
    const english = getMessages('en-US'),
      korean = getMessages('ko-KR');
    registry.register({
      name: 'OPEN',
      displayName: { 'ko-KR': korean.openCad, 'en-US': english.openCad },
      description: { 'ko-KR': korean.localDrawingNote, 'en-US': english.localDrawingNote },
      execute: () => {
        fileInput.current?.click();
      },
    });
    registry.register({
      name: 'LAYON',
      displayName: { 'ko-KR': korean.showAllLayers, 'en-US': english.showAllLayers },
      description: { 'ko-KR': korean.hiddenLayersNote, 'en-US': english.hiddenLayersNote },
      execute: () => {
        const active = actions.current;
        const next = {
          ...active.drawing,
          state: {
            ...active.drawing.state,
            layers: active.drawing.state.layers.map((layer) => ({ ...layer, visible: true })),
          },
        };
        commitDrawing('LAYON', next, false, visibleCadEntities(active.drawing.state).length === 0);
        active.print(active.messages.layersShown);
      },
    });
    registry.register({
      name: 'NEW',
      displayName: { 'ko-KR': korean.newDrawing, 'en-US': english.newDrawing },
      description: { 'ko-KR': korean.newDrawing, 'en-US': english.newDrawing },
      execute: () => {
        controller.current?.abort();
        originalSource.current = null;
        commitDrawing('NEW', { state: createEmptyCadState(), fileName: '', report: null }, true);
        actions.current.print(actions.current.messages.newDrawingStarted);
      },
    });
    const exports: readonly [
      string,
      ExportFormat,
      keyof Pick<Messages, 'exportPdf' | 'exportPng' | 'exportJpg' | 'exportSvg' | 'exportDxf'>,
    ][] = [
      ['EXPORTPDF', 'pdf', 'exportPdf'],
      ['EXPORTPNG', 'png', 'exportPng'],
      ['EXPORTJPG', 'jpg', 'exportJpg'],
      ['EXPORTSVG', 'svg', 'exportSvg'],
      ['QSAVE', 'dxf', 'exportDxf'],
    ];
    for (const [name, format, label] of exports)
      registry.register({
        name,
        displayName: { 'ko-KR': korean[label], 'en-US': english[label] },
        description: { 'ko-KR': korean.exportNote, 'en-US': english.exportNote },
        execute: () => exportDrawing(format),
      });
  }, [registry, messages]);

  const visibleCount = visibleCadEntities(drawing.state).length;
  return {
    ...drawing,
    reading,
    restoring,
    progress,
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
