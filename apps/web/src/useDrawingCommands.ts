import { useEffect, useRef } from 'react';
import type { Messages } from '@hancad/ui';
import { useDrafting } from './useDrafting';
import { useDimensions } from './useDimensions';
import { useModification } from './useModification';
import { useMeasurement } from './useMeasurement';
import { useEditingTools } from './useEditingTools';
import { useTextCreation } from './useTextCreation';
import type { useDrawingFiles } from './useDrawingFiles';
import type { useCommandSession } from './useCommandSession';
import { toolInputMode } from './input-mode';
import { useGrips } from './useGrips';
import { useClipboardCommands } from './useClipboardCommands';
import { useProperties } from './useProperties';
import { useLayerTools } from './layers/useLayerTools';
import { nativePropertyState, commitNativePropertyState } from './native-property-state';
import { commitNativeLayerChange } from './native-layer-change';
import { drawingStyleState } from './drawing-style-state';

interface Controller {
  isActive: () => boolean;
  cancel: (notify?: boolean) => boolean;
  submit: (value: string) => boolean;
}
export function useDrawingCommands({
  session,
  files,
  messages,
  resolveTypedPoint,
  pickEntityId,
}: {
  session: ReturnType<typeof useCommandSession>;
  files: ReturnType<typeof useDrawingFiles>;
  messages: Messages;
  resolveTypedPoint?: Parameters<typeof useDrafting>[0]['resolveTypedPoint'];
  pickEntityId?: Parameters<typeof useDrafting>[0]['pickEntityId'];
}) {
  const controllers = useRef<Record<string, Controller>>({});
  function cancelOthers(except = ''): void {
    for (const [name, item] of Object.entries(controllers.current))
      if (name !== except && item.isActive()) item.cancel(false);
  }
  const common = {
    registry: session.registry,
    sysvars: session.sysvars,
    messages,
    getState: () => drawingStyleState(session.database, files.getState()),
    commitState: files.commitState,
    print: session.print,
  };
  const draft = useDrafting({
    ...common,
    state: files.state,
    cancelOthers: () => cancelOthers('draft'),
    getSelectionState: () => {
      const state = nativePropertyState(session.database, files.getState());
      return layers.isActive()
        ? { ...state, layers: state.layers.map((l) => ({ ...l, locked: false })) }
        : state;
    },
    additionalValidIds: () =>
      nativePropertyState(session.database, files.getState()).entities.map((e) => e.id),
    onSelectionComplete: () => {
      const owner = Object.entries(controllers.current).find(
        ([name, item]) => name !== 'draft' && item.isActive(),
      );
      owner?.[1].submit('');
    },
    selectionPromptActive: () =>
      (modification.isActive() && !modification.needsPoint()) ||
      draft.isModifySelecting() ||
      clipboard.snapshot?.inputMode === 'selection' ||
      properties.isSelecting() ||
      layers.snapshot?.inputMode === 'selection',
    ...(resolveTypedPoint ? { resolveTypedPoint } : {}),
    ...(pickEntityId ? { pickEntityId } : {}),
  });
  const dimensions = useDimensions({
    ...common,
    selectedIds: draft.selectedIds,
    cancelDraft: () => cancelOthers('dimensions'),
  });
  const modification = useModification({
    ...common,
    getSelectedIds: draft.getSelectedIds,
    clearSelection: draft.clearSelection,
    cancelOthers: () => cancelOthers('modification'),
  });
  const measurement = useMeasurement({
    ...common,
    cancelOthers: () => cancelOthers('measurement'),
  });
  const editing = useEditingTools({
    ...common,
    ...(pickEntityId ? { pickEntityId } : {}),
    cancelOthers: () => cancelOthers('editing'),
  });
  const text = useTextCreation({ ...common, cancelOthers: () => cancelOthers('text') });
  const grip = useGrips({
    ...common,
    getSelectedIds: draft.getSelectedIds,
    clearSelection: draft.clearSelection,
    getSelectedSubobjects: () => draft.selectedSubobjects,
    cancelOthers: () => cancelOthers('grip'),
    ...(resolveTypedPoint ? { resolveTypedPoint } : {}),
  });
  const clipboard = useClipboardCommands({
    ...common,
    database: session.database,
    getSelectedIds: draft.getSelectedIds,
    clearSelection: draft.clearSelection,
    selectIds: draft.selectIds,
    cancelOthers: () => cancelOthers('clipboard'),
    ...(resolveTypedPoint ? { resolveTypedPoint } : {}),
  });
  const properties = useProperties({
    ...common,
    selectedIds: draft.selectedIds,
    korean: messages.cancel.includes('취소'),
    getSelectedIds: draft.getSelectedIds,
    selectIds: draft.selectIds,
    clearSelection: draft.clearSelection,
    cancelOthers: () => cancelOthers('properties'),
    ...(pickEntityId ? { pickEntityId } : {}),
    execute: (command: string) => {
      void session.execute(command);
    },
    getPropertyState: () => nativePropertyState(session.database, files.getState()),
    commitPropertyState: (label, next) =>
      commitNativePropertyState(session.sysvars, label, files.getState(), next, files.commitState),
  });
  const layers = useLayerTools({
    ...common,
    getState: () => ({
      ...files.getState(),
      settings: { ...files.getState().settings, layer: String(session.sysvars.get('CLAYER')) },
    }),
    database: session.database,
    korean: messages.cancel.includes('취소'),
    getSelectedIds: draft.getSelectedIds,
    selectIds: draft.selectIds,
    clearSelection: draft.clearSelection,
    cancelOthers: () => cancelOthers('layers'),
    getAllEntityIds: () =>
      nativePropertyState(session.database, files.getState()).entities.map((e) => e.id),
    getPreviewEntities: () => nativePropertyState(session.database, files.getState()).entities,
    getEntityLayer: (id) =>
      nativePropertyState(session.database, files.getState()).entities.find((e) => e.id === id)
        ?.layer,
    commitNativeLayerChange: (label, state, variables, change) =>
      commitNativeLayerChange(
        session.sysvars,
        label,
        files.getState(),
        state,
        variables,
        change,
        files.commitState,
      ),
  });
  useEffect(
    () =>
      session.sysvars.events.subscribe((event) => {
        if (
          event.name === 'PICKFIRST' &&
          event.value === 0 &&
          !Object.values(controllers.current).some((item) => item.isActive())
        )
          draft.clearSelection();
      }),
    [session.sysvars],
  );
  // Measurement first: a transparent 'DIST answers before the command it interrupts.
  controllers.current = {
    measurement,
    grip,
    clipboard,
    properties,
    layers,
    editing,
    text,
    modification,
    dimensions,
    draft,
  };
  const active = Object.values(controllers.current).some((item) => item.isActive());
  // A transparent 'DIST shows its rubber band instead of the interrupted command's preview.
  const preview =
    measurement.snapshot?.preview ??
    grip.snapshot?.preview ??
    clipboard.snapshot?.preview ??
    layers.snapshot?.preview ??
    editing.snapshot?.preview ??
    text.snapshot?.preview ??
    dimensions.snapshot?.preview ??
    modification.snapshot?.preview ??
    draft.snapshot?.preview ??
    [];
  const commandPreview = session.sysvars.getNumber('COMMANDPREVIEW') !== 0;
  const controlledPreview =
    draft.snapshot &&
    ['OFFSET', 'FILLET', 'CHAMFER', 'LENGTHEN', 'BLEND'].includes(draft.snapshot.tool);
  return {
    draft,
    dimensions,
    modification,
    measurement,
    editing,
    text,
    grip,
    clipboard,
    properties,
    layers,
    active,
    state: layers.previewState ?? properties.previewState ?? editing.snapshot?.state ?? files.state,
    selectedIds:
      editing.snapshot && editing.snapshot.tool !== 'OFFSET'
        ? editing.snapshot.boundaryIds
        : (draft.snapshot?.selectionIds ?? draft.visibleSelectedIds),
    preview:
      !commandPreview && editing.active
        ? []
        : !commandPreview && controlledPreview
          ? draft.getSnapEntities()
          : preview,
    previewHiddenIds:
      grip.snapshot?.previewHiddenIds ??
      (draft.snapshot
        ? !commandPreview && controlledPreview
          ? (draft.snapshot.acceptedEraseIds ?? [])
          : draft.snapshot.previewHiddenIds
        : undefined) ??
      (session.sysvars.getNumber('COMMANDPREVIEW') !== 0 && editing.snapshot?.tool !== 'OFFSET'
        ? (editing.snapshot?.previewHiddenIds ?? [])
        : []),
    prompt:
      measurement.prompt ??
      grip.prompt ??
      (draft.isFilterSelection() ? draft.prompt : null) ??
      (draft.hasSelectionSubprompt() ? draft.prompt : null) ??
      clipboard.prompt ??
      properties.prompt ??
      layers.prompt ??
      editing.prompt ??
      text.prompt ??
      dimensions.prompt ??
      modification.prompt ??
      draft.prompt ??
      session.prompt,
    usage: text.active
      ? messages.textUsage
      : editing.active
        ? messages.editingUsage
        : dimensions.active
          ? messages.dimensionUsage
          : messages.draftingUsage,
    editable:
      layers.inputMode === 'text' || draft.snapshot?.inputMode === 'text'
        ? true
        : draft.selecting && draft.editable
          ? true
          : dimensions.active
            ? dimensions.editable
            : !active && session.editable,
    /** Prompt input type for the ImeController; undefined when no drawing tool is active. */
    inputMode:
      grip.inputMode ??
      (draft.isFilterSelection() ? draft.inputMode : undefined) ??
      (draft.hasSelectionSubprompt() ? draft.inputMode : undefined) ??
      clipboard.inputMode ??
      properties.inputMode ??
      layers.inputMode ??
      draft.snapshot?.inputMode ??
      (draft.selecting && !draft.isDrafting() ? draft.inputMode : undefined) ??
      toolInputMode({
        editing: editing.snapshot,
        text: text.snapshot,
        dimensions: dimensions.snapshot,
        modification: modification.snapshot,
        measuring: measurement.active,
        drafting: draft.snapshot !== null,
        selecting: draft.active,
      }),
    isActive: () => Object.values(controllers.current).some((item) => item.isActive()),
    cancelAll: cancelOthers,
    cancel: (): boolean => {
      if (draft.isFilterSelection()) return draft.cancel(true);
      const item = Object.values(controllers.current).find((entry) => entry.isActive());
      if (item) {
        item.cancel();
        draft.resetSelectionPrompt();
        return true;
      }
      if (grip.hasHotGrips()) return grip.cancel();
      if (draft.getSelectedIds().length) {
        draft.cancel();
        return true;
      }
      return false;
    },
    submit: (value: string): boolean => {
      if (draft.isFilterSelection()) return draft.submit(value);
      if (properties.isActive() && /^(?:_?S|_?SETTINGS)$/i.test(value.trim()))
        return properties.submit(value);
      const selecting =
        (modification.isActive() && !modification.needsPoint()) ||
        clipboard.snapshot?.inputMode === 'selection' ||
        properties.isSelecting() ||
        layers.snapshot?.inputMode === 'selection';
      if (selecting && draft.submitSelection(value)) return true;
      if (selecting && !value.trim()) draft.rememberSelection();
      if (selecting && !value.trim()) draft.resetSelectionPrompt();
      return Object.values(controllers.current).some((item) => item.submit(value));
    },
  };
}
