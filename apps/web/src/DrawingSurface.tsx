import { useLayoutEffect, useRef, useState } from 'react';
import type { Messages } from '@hancad/ui';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CadCanvasOptions, CadPointerPick } from '@hancad/render';
import { CanvasSurface } from './canvas-surface';
import { errorMessage } from './error-presenter';

export type LayoutId = 'model' | 'layoutOne' | 'layoutTwo';

export function DrawingSurface({
  messages,
  layout,
  onFocus,
  drawing,
  onReady,
  execute,
  fitRevision,
  preview,
  previewHiddenIds,
  selectedIds,
  active,
  onPick,
  onCoordinates,
  canSelectArea,
  onSelectionDrag,
  suppressSelectionBox,
  getNavigationSettings,
  selectionGesture,
  onNavigate,
  getNavigationMode,
  getNavigationWindow,
  getAidSettings,
  getSystemVariable,
  getLinetypes,
  getLayerStyles,
}: {
  messages: Messages;
  layout: LayoutId;
  onFocus: () => void;
  drawing: LegacyCadState;
  onReady: (surface: CanvasSurface | null) => void;
  execute: (command: string) => void;
  fitRevision: number;
  preview: readonly CadEntity[];
  previewHiddenIds: readonly string[];
  selectedIds: readonly string[];
  active: boolean;
  onPick: (event: CadPointerPick) => void;
  onCoordinates: (point: CadPoint) => void;
  canSelectArea: NonNullable<CadCanvasOptions['canSelectArea']>;
  onSelectionDrag: NonNullable<CadCanvasOptions['onSelectionDrag']>;
  suppressSelectionBox: NonNullable<CadCanvasOptions['suppressSelectionBox']>;
  getNavigationSettings: NonNullable<CadCanvasOptions['getNavigationSettings']>;
  selectionGesture: NonNullable<CadCanvasOptions['selectionGesture']>;
  onNavigate: NonNullable<CadCanvasOptions['onNavigate']>;
  getNavigationMode: NonNullable<CadCanvasOptions['getNavigationMode']>;
  getNavigationWindow: NonNullable<CadCanvasOptions['getNavigationWindow']>;
  getAidSettings: NonNullable<CadCanvasOptions['getAidSettings']>;
  getSystemVariable: NonNullable<CadCanvasOptions['getSystemVariable']>;
  getLinetypes: NonNullable<CadCanvasOptions['getLinetypes']>;
  getLayerStyles: NonNullable<CadCanvasOptions['getLayerStyles']>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<CanvasSurface | null>(null);
  const rendered = useRef<{ drawing: LegacyCadState; fitRevision: number } | null>(null);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    let canvas: CanvasSurface | undefined;
    try {
      canvas = new CanvasSurface(host.current, messages.drawingCanvas, {
        onPick,
        onCoordinates,
        canSelectArea,
        onSelectionDrag,
        suppressSelectionBox,
        getNavigationSettings,
        selectionGesture,
        onNavigate,
        getNavigationMode,
        getNavigationWindow,
        getAidSettings,
        getSystemVariable,
        getLinetypes,
        getLayerStyles,
      });
      canvas.setDrawing(drawing);
      surface.current = canvas;
      onReady(canvas);
      rendered.current = { drawing, fitRevision };
    } catch (error) {
      canvas?.dispose();
      surface.current = null;
      rendered.current = null;
      onReady(null);
      setFailure({ error });
      return;
    }
    return () => {
      canvas?.dispose();
      onReady(null);
      surface.current = null;
      rendered.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const previous = rendered.current;
    if (previous?.drawing === drawing && previous.fitRevision === fitRevision) return;
    surface.current?.setDrawing(drawing, previous?.fitRevision !== fitRevision);
    rendered.current = { drawing, fitRevision };
  }, [drawing, fitRevision]);
  useLayoutEffect(() => {
    surface.current?.setPreview(preview);
  }, [preview]);
  useLayoutEffect(() => {
    surface.current?.setPreviewHiddenIds(previewHiddenIds);
  }, [previewHiddenIds]);
  useLayoutEffect(() => {
    surface.current?.setSelection(selectedIds);
  }, [selectedIds, drawing]);
  useLayoutEffect(() => {
    surface.current?.setLabel(messages.drawingCanvas);
  }, [messages]);

  return (
    <section className="drawing-region" aria-label={messages.drawingCanvas} onPointerDown={onFocus}>
      <div className="canvas-host" ref={host} />
      {failure && (
        <div className="foundation-note renderer-error" data-testid="renderer-error" role="alert">
          <strong>{messages.rendererUnavailable}</strong>
          <p>{messages.rendererFailure(errorMessage(failure.error, messages))}</p>
        </div>
      )}
      <div className="viewport-label">
        [{messages.topView}] [{messages.wireframe}]
      </div>
      {layout !== 'model' && drawing.entities.length > 0 && (
        <p className="layout-placeholder-note">{messages.layoutNote}</p>
      )}
      {!failure && !drawing.entities.length && !active && (
        <div className="foundation-note">
          <span className="phase-label">{messages.foundation}</span>
          <p>{layout === 'model' ? messages.noDrawing : messages.layoutNote}</p>
          <button onClick={() => execute('OPEN')}>{messages.openCad}</button>
        </div>
      )}
    </section>
  );
}
