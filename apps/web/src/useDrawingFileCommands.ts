import { useEffect, useRef } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { exportCadDrawing } from '@hancad/io-pdf';
import type { DocumentManager, SysvarValue } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { Messages } from '@hancad/ui';
import type { DrawingSession } from './drawing-session';
import { setDocumentSource } from './document-source';
import { restoreDrawingErasure } from './erasure-history';

type ExportFormat = 'pdf' | 'png' | 'jpg' | 'svg' | 'dxf';
interface DrawingFileCommandsOptions {
  registry: CommandRegistry;
  database: DrawingDatabase;
  messages: Messages;
  fileInput: { current: HTMLInputElement | null };
  controller: { current: AbortController | null };
  lastErased: { current: readonly CadEntity[] };
  getDrawing: () => DrawingSession;
  print: (message: string) => void;
  commitDrawing: (
    label: string,
    next: DrawingSession,
    newBase?: boolean,
    fit?: boolean,
    variables?: Readonly<Record<string, SysvarValue>>,
  ) => void;
  commitState: (
    label: string,
    state: LegacyCadState,
    variables?: Readonly<Record<string, SysvarValue>>,
  ) => void;
  newDocument: (() => void) | undefined;
  manager: DocumentManager | undefined;
  documentId: string | undefined;
}

export function useDrawingFileCommands(options: DrawingFileCommandsOptions): void {
  const live = useRef(options);
  live.current = options;
  const { registry, messages } = options;
  async function exportDrawing(format: ExportFormat): Promise<void> {
    const active = live.current,
      drawing = active.getDrawing();
    if (!drawing.state.entities.length) throw new Error(active.messages.noDrawing);
    const result = await exportCadDrawing(drawing.state, format);
    const url = URL.createObjectURL(result.blob),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    const current = live.current;
    current.print(current.messages.exportFinished(result.fileName));
  }
  useEffect(() => {
    const english = getMessages('en-US'),
      korean = getMessages('ko-KR');
    registry.register({
      name: 'OPEN',
      displayName: { 'ko-KR': korean.openCad, 'en-US': english.openCad },
      description: { 'ko-KR': korean.localDrawingNote, 'en-US': english.localDrawingNote },
      execute: () => {
        live.current.fileInput.current?.click();
      },
    });
    registry.register({
      name: 'LAYON',
      displayName: { 'ko-KR': korean.showAllLayers, 'en-US': english.showAllLayers },
      description: { 'ko-KR': korean.hiddenLayersNote, 'en-US': english.hiddenLayersNote },
      execute: () => {
        const active = live.current,
          drawing = active.getDrawing();
        const next = {
          ...drawing,
          state: {
            ...drawing.state,
            layers: drawing.state.layers.map((layer) => ({ ...layer, visible: true })),
          },
        };
        active.commitDrawing('LAYON', next, false, visibleCadEntities(drawing.state).length === 0);
        active.print(active.messages.layersShown);
      },
    });
    registry.register({
      name: 'NEW',
      displayName: { 'ko-KR': korean.newDrawing, 'en-US': english.newDrawing },
      description: { 'ko-KR': korean.newDrawing, 'en-US': english.newDrawing },
      execute: () => {
        const active = live.current;
        active.controller.current?.abort();
        if (active.newDocument) {
          active.newDocument();
          return;
        }
        setDocumentSource(active.database);
        active.commitDrawing(
          'NEW',
          { state: createEmptyCadState(), fileName: '', report: null },
          true,
        );
        active.print(active.messages.newDrawingStarted);
      },
    });
    registry.register({
      name: 'HANSAVE',
      displayName: { 'ko-KR': korean.saveNative, 'en-US': english.saveNative },
      description: { 'ko-KR': korean.saveNative, 'en-US': english.saveNative },
      execute: () => {
        const active = live.current;
        if (!active.manager || !active.documentId) return;
        const bytes = active.manager.saveHcd(active.documentId);
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob),
          anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${active.getDrawing().state.name.replace(/\.[^.]*$/, '')}.hcd`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        active.print(active.messages.exportFinished(anchor.download));
      },
    });
    registry.register({
      name: 'OOPS',
      displayName: { 'ko-KR': 'OOPS', 'en-US': 'OOPS' },
      description: { 'ko-KR': korean.restoreErased, 'en-US': english.restoreErased },
      execute: () => {
        const active = live.current,
          current = active.getDrawing().state;
        const ids = new Set(current.entities.map((entity) => entity.id));
        const entities = active.lastErased.current.filter((entity) => !ids.has(entity.id));
        if (entities.length)
          active.commitState('OOPS', {
            ...current,
            entities: restoreDrawingErasure(current.entities, active.lastErased.current),
          });
        else if (!active.database.oops()) active.print(active.messages.noErasedObjects);
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
}
